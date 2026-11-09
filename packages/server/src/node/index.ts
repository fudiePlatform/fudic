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

/** The body of `req`, pulled from it only as it is read. Cancelled: the rest is left unread. */
function lazyBody(req: IncomingMessage): ReadableStream<Uint8Array> {
  let chunks: AsyncIterator<Buffer> | undefined;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      chunks ??= req[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
      const next = await chunks.next();
      if (next.done === true) controller.close();
      else controller.enqueue(new Uint8Array(next.value.buffer, next.value.byteOffset, next.value.byteLength));
    },
    cancel() {
      req.pause();
    },
  });
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

/**
 * A `Response`, written to a Node response as its body comes: never gathered. When the client
 * goes away the body is cancelled, and whoever produces it is told (a render stops, a spool is
 * released). A body that fails half-way cuts the connection: its status is already out.
 */
export async function sendResponse(res: ServerResponse, response: Response): Promise<void> {
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
 * The server as a Connect middleware: the extra headers of the app's static files, then
 * `fetch` (with its `103`), and `next()` for what it does not answer. An error of the server
 * itself — dev refusing a page — goes to `next(error)`.
 */
export function nodeMiddleware(server: FudicServer, options: NodeMiddlewareOptions = {}): NodeMiddleware {
  return (req, res, next) => {
    const request = toRequest(req, res);
    const statics = server.staticHeaders(request);
    if (statics !== null) {
      for (const [name, value] of Object.entries(statics)) res.setHeader(name, value);
      next();
      return;
    }
    const hooks = hooksFor(req, res);
    server
      .fetch(request, hooks)
      .then((response) => (response === null && options.notFound === true ? server.notFound(request, hooks) : response))
      .then((response) => {
        if (response === null) return next();
        // A body the server stopped reading (a limit, SDD-81 §3.5): over HTTP/1.1 Node would read
        // the rest to keep the connection; closed instead, the rest is never read.
        if (req.httpVersionMajor === 1 && !req.complete && req.method !== 'GET' && req.method !== 'HEAD') res.setHeader('connection', 'close');
        return sendResponse(res, response);
      })
      .catch(next);
  };
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
