/**
 * `@fudic/server/node`: the server on `node:http` (SDD-81 §3.10) — for the Vite plugin, in dev
 * and preview, and for any adapter that runs on Node. Deno, Bun and the edge speak `Request` and
 * `Response` already and need none of this.
 */

import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isAbsolute, join, relative } from 'node:path';
import type { EarlyHints, FetchHooks, FudicServer } from '../types.js';

export { diskSpool } from './spool.js';
export { staticFiles } from './files.js';

/**
 * A Node request as a `Request`, whose `signal` aborts when the client goes away before the
 * response is written (SDD-56 §4.12).
 *
 * Its body is read only when someone reads it, and as it is read: a server that stops at a
 * limit leaves the rest unread (SDD-81 §3.5), and a request nobody here answers goes on to
 * the next middleware untouched.
 */
export function toRequest(req: IncomingMessage, res: ServerResponse): Request {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    // HTTP/2 hands its pseudo-headers (`:method`, `:path`, `:authority`) over with the rest, and
    // no `Headers` takes a name with a colon.
    if (value === undefined || name.startsWith(':')) continue;
    for (const one of Array.isArray(value) ? value : [value]) headers.append(name, one);
  }
  const method = req.method ?? 'GET';
  // `originalUrl`: Connect's, with the app's `base` still on it.
  const path = (req as IncomingMessage & { readonly originalUrl?: string }).originalUrl ?? req.url ?? '/';
  // HTTP/2 has no `host`: it travels as `:authority`. A TLS socket is `https`.
  const host = req.headers.host ?? (req.headers[':authority'] as string | undefined) ?? 'localhost';
  const scheme = (req.socket as { readonly encrypted?: boolean } | undefined)?.encrypted === true ? 'https' : 'http';
  const body = method === 'GET' || method === 'HEAD' ? undefined : lazyBody(req);
  return new Request(new URL(path, `${scheme}://${host}`), {
    method,
    headers,
    signal: controller.signal,
    ...(body !== undefined ? { body, duplex: 'half' } : {}),
  } as RequestInit);
}

/**
 * The body of `req`, pulled from it only as it is read. Cancelled: the rest is left unread.
 *
 * It reads through `data` and `pause`, never an async iterator: an iterator holds the stream for
 * good, and the rest of a body could no longer be thrown away once the response is out.
 */
function lazyBody(req: IncomingMessage): ReadableStream<Uint8Array> {
  let detach: (() => void) | undefined;
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        detach ??= listen(req, controller);
        req.resume();
      },
      cancel() {
        detach?.();
        req.pause();
      },
    },
    { highWaterMark: 0 },
  );
}

/** Feeds `controller` from `req`, one chunk per pull. Returns what stops it. */
function listen(req: IncomingMessage, controller: ReadableStreamDefaultController<Uint8Array>): () => void {
  const data = (chunk: Buffer): void => {
    req.pause();
    controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
  };
  const end = (): void => controller.close();
  const error = (cause: Error): void => controller.error(cause);
  req.on('data', data).once('end', end).once('error', error);
  return () => {
    req.off('data', data).off('end', end).off('error', error);
  };
}

/**
 * Headers, written to a Node response, `set-cookie` with its several values. What `load` wrote
 * goes before fudic's own headers (SDD-69 §4.2).
 */
export function writeHeaders(res: ServerResponse, headers: Headers): void {
  headers.forEach((value, name) => {
    if (name !== 'set-cookie') res.setHeader(name, value);
  });
  const cookies = headers.getSetCookie();
  if (cookies.length > 0) res.setHeader('set-cookie', cookies);
}

/** Until `res` can take more, or is gone. */
function writable(res: ServerResponse): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      res.off('drain', done);
      res.off('close', done);
      resolve();
    };
    res.on('drain', done);
    res.on('close', done);
  });
}

/** What a network failure writes before it closes the connection: not HTTP, so no response. */
export const NOT_HTTP = 'fudic: no response\r\n\r\n';

/**
 * A `Response`, written to a Node response as its body comes: never gathered. When the client
 * goes away the body is cancelled, and whoever produces it is told (a render stops, a spool is
 * released). A body that fails half-way cuts the connection: its status is already out.
 */
export async function sendResponse(res: ServerResponse, response: Response): Promise<void> {
  // `Response.error()`: no response at all, as a network failure looks to the client (SDD-82 §3.5).
  // A bare cut is not enough: on a keep-alive connection already used, a browser takes a cut with
  // nothing received for a stale connection and sends the request again (Chrome, once per idle
  // connection it holds), and the server would see one call several times. Bytes that are not
  // HTTP fail it at once, with no response and nothing sent again. An HTTP/2 stream is reset.
  if (response.type === 'error') {
    if ('stream' in res || res.socket === null) res.destroy();
    else res.socket.end(NOT_HTTP);
    return;
  }
  res.statusCode = response.status;
  writeHeaders(res, response.headers);
  if (response.body === null) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  res.on('close', () => {
    if (!res.writableEnded) void reader.cancel().catch(() => undefined);
  });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (res.destroyed) return;
      if (res.write(value) === false) await writable(res);
    }
  } catch (error) {
    res.destroy(error as Error);
    return;
  }
  res.end();
}

/** A response that may know how to send a `103` (Node's, plain or HTTP/2). */
type HintedResponse = ServerResponse & {
  readonly writeEarlyHints?: (hints: Readonly<Record<string, string | readonly string[]>>) => void;
};

/**
 * Whether a `103` is worth sending to `req`: a top-level navigation over HTTP/2 or later — what
 * Chrome recommends, and what keeps HTTP/1.1 clients and proxies, which do not know what to do
 * with a `1xx`, out of it (SDD-73 §3.2).
 */
export function wantsEarlyHints(req: IncomingMessage): boolean {
  return req.httpVersionMajor >= 2 && req.headers['sec-fetch-mode'] === 'navigate';
}

/** The hooks that send `103` on `res`, once, when `req` wants one and Node can. */
function hooksFor(req: IncomingMessage, res: ServerResponse): FetchHooks {
  const hinted = res as HintedResponse;
  if (!wantsEarlyHints(req) || typeof hinted.writeEarlyHints !== 'function') return {};
  const write = hinted.writeEarlyHints.bind(hinted);
  return { earlyHints: (hints: EarlyHints) => write({ ...hints, link: [...hints.link] }) };
}

/** A Connect middleware: what Vite and Express take. */
export type NodeMiddleware = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void;

export interface NodeMiddlewareOptions {
  /**
   * What nothing answered, painted as `_error.fud` with a `404` when it is a navigation, instead
   * of going on to `next`. For the last middleware of the chain, after the host's own files.
   */
  readonly notFound?: boolean;
}

/**
 * `headers` on `res`, and kept there whatever the next middleware writes (SDD-84 §4.4): a static
 * server (`sirv`, `express.static`) writes its own `Cache-Control`, and what `assets.headers` says
 * has to win. So `setHeader` and `writeHead` are wrapped for the rest of this response, and a name
 * of `headers` they try to write is dropped; a `''` value is a header that does not go out at all.
 */
export function enforceHeaders(res: ServerResponse, headers: Readonly<Record<string, string>>): void {
  const owned = new Set(Object.keys(headers).map((name) => name.toLowerCase()));
  for (const [name, value] of Object.entries(headers)) {
    if (value === '') res.removeHeader(name);
    else res.setHeader(name, value);
  }
  const setHeader = res.setHeader.bind(res);
  res.setHeader = ((name: string, value: number | string | readonly string[]) =>
    owned.has(name.toLowerCase()) ? res : setHeader(name, value)) as ServerResponse['setHeader'];
  const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => ServerResponse;
  res.writeHead = ((...args: unknown[]) => writeHead(...args.map(withoutOwned(owned)))) as ServerResponse['writeHead'];
}

/** A `writeHead` argument without the names in `owned`: its headers, as an object or as a flat list. */
function withoutOwned(owned: ReadonlySet<string>): (arg: unknown) => unknown {
  return (arg) => {
    if (Array.isArray(arg)) {
      const kept: unknown[] = [];
      for (let i = 0; i < arg.length; i += 2) {
        if (!owned.has(String(arg[i]).toLowerCase())) kept.push(arg[i], arg[i + 1]);
      }
      return kept;
    }
    if (typeof arg !== 'object' || arg === null) return arg;
    return Object.fromEntries(Object.entries(arg).filter(([name]) => !owned.has(name.toLowerCase())));
  };
}

/**
 * The server as a Connect middleware: `fetch` (with its `103`), and for what it does not answer —
 * a static file, the host's — the headers `assets.headers` gives it, then `next()`. An error of
 * the server itself — dev refusing a page — goes to `next(error)`.
 */
export function nodeMiddleware(server: FudicServer, options: NodeMiddlewareOptions = {}): NodeMiddleware {
  return (req, res, next) => {
    const request = toRequest(req, res);
    const hooks = hooksFor(req, res);
    server
      .fetch(request, hooks)
      .then((response) => (response === null && options.notFound === true ? server.notFound(request, hooks) : response))
      .then((response) => {
        if (response === null) {
          const statics = server.staticHeaders(request);
          if (statics !== null) enforceHeaders(res, statics);
          return next();
        }
        if (req.httpVersionMajor === 1 && !req.complete && req.method !== 'GET' && req.method !== 'HEAD') lingerUnread(req, res);
        return sendResponse(res, response);
      })
      .catch(next);
  };
}

/** How long a connection whose body was left unread waits for the client to stop sending. */
export const LINGER_MS = 2000;

/**
 * A body the server stopped reading (a limit, SDD-81 §3.5). The response goes out first and the
 * rest of the body stays unread. Closing at once would not do: a socket destroyed with bytes of
 * the client still unread is reset, and a reset throws away the response the client has not read
 * yet — it would see a broken connection instead of its `413`. So the connection lingers: the
 * client reads the answer and stops sending, and LINGER_MS after the response it goes, whatever
 * the client did. A body that the client does finish in time leaves it open, as usual: once the
 * response is out, what is left of the body is read and thrown away, so the request can end.
 */
function lingerUnread(req: IncomingMessage, res: ServerResponse): void {
  res.once('finish', () => {
    if (req.complete) return;
    const timer = setTimeout(() => req.socket.destroy(), LINGER_MS);
    timer.unref();
    req.once('end', () => clearTimeout(timer));
    req.removeAllListeners('data');
    req.resume();
  });
}

/** `/` → `index.html`, `/about` → `about/index.html`: where the build writes a prerendered page. */
export function htmlPathFor(pathname: string): string {
  const segments = pathname.split('/').filter((s) => s.length > 0);
  return segments.length === 0 ? 'index.html' : `${segments.join('/')}/index.html`;
}

/**
 * The prerendered pages under `dir` (the build's `outDir`): what preview and a Node adapter hand
 * to the app. `null` for a path with no page, or one that would leave `dir`.
 */
export function staticPages(dir: string): (pathname: string) => Promise<string | null> {
  return async (pathname) => {
    const file = join(dir, htmlPathFor(pathname));
    const inside = relative(dir, file);
    if (inside.startsWith('..') || isAbsolute(inside)) return null;
    try {
      return await readFile(file, 'utf8');
    } catch {
      return null;
    }
  };
}
