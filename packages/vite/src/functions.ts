/**
 * Server functions in the plugin (SDD-56 §4.15): served by the dev server and by `vite
 * preview`, and bundled by the build into `.fudic/edge/functions.mjs`.
 *
 * Where a request goes is the `handler` of the generated server root (SDD-60 §4.4), in all
 * three: this module carries a Node request into a `Request` and a `Response` back out, and
 * writes the module the build bundles.
 */

import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Whether `pathname` is a server function's URL, `base` included. */
export function isFnPath(pathname: string, base: string): boolean {
  return pathname.startsWith(`${base.replace(/\/$/u, '')}/_fudic/fn/`);
}

/**
 * A Node request as a `Request`, whose `signal` aborts when the client goes away before the
 * response is written (§4.12).
 */
export function toRequest(req: IncomingMessage, res: ServerResponse): Request {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const one of Array.isArray(value) ? value : [value]) headers.append(name, one);
  }
  const method = req.method ?? 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : (Readable.toWeb(req) as ReadableStream);
  // `originalUrl`: Connect's, with the app's `base` still on it.
  const path = (req as IncomingMessage & { readonly originalUrl?: string }).originalUrl ?? req.url ?? '/';
  return new Request(new URL(path, `http://${req.headers.host ?? 'localhost'}`), {
    method,
    headers,
    signal: controller.signal,
    ...(body !== undefined ? { body, duplex: 'half' } : {}),
  } as RequestInit);
}

/**
 * A `Response`, written to a Node response. `set-cookie` keeps its several values. `null` is
 * the handler's «not mine», and the request goes on to `next`.
 */
export async function sendResponse(res: ServerResponse, response: Response | null, next: () => void): Promise<void> {
  if (response === null) {
    next();
    return;
  }
  res.statusCode = response.status;
  writeHeaders(res, response.headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

/**
 * Headers, written to a Node response, `set-cookie` with its several values. A page and its
 * data endpoint write what `load` wrote with it (SDD-69 §4.2), before fudic's own headers.
 */
export function writeHeaders(res: ServerResponse, headers: Headers): void {
  headers.forEach((value, name) => {
    if (name !== 'set-cookie') res.setHeader(name, value);
  });
  const cookies = headers.getSetCookie();
  if (cookies.length > 0) res.setHeader('set-cookie', cookies);
}

/** The server root's `handler` (SDD-60 §4.4), as the plugin calls it out of the dev graph. */
export type ContractsHandler = (options: {
  readonly base: string;
  readonly dev: boolean;
  readonly onError: (error: unknown) => void;
}) => (request: Request) => Promise<Response | null>;

/**
 * The `.fudic/edge/functions.mjs` module: every function of the `.fudapi` of the app behind one
 * handler, the server root's (SDD-60 §4.4).
 */
export function emitFunctionsModule(input: {
  /** The id of the server root, whose `handler` answers them. */
  readonly api: string;
  readonly base: string;
  /** Each function's URL and method, for the table an adapter mounts. */
  readonly table: readonly { readonly url: string; readonly method: string }[];
}): string {
  return [
    `import { handler as $api } from ${JSON.stringify(input.api)};`,
    '/** Every server function of the app: a `Request` in, a `Response` out, `null` when not ours. */',
    `export const handle = $api({ base: ${JSON.stringify(input.base)} });`,
    '/** Each function by URL pattern and method, for an adapter to mount. */',
    `export const functions = ${JSON.stringify(input.table)}.map((entry) => ({ ...entry, handle }));`,
    '',
  ].join('\n');
}

/** What a function URL gets in an app without a `.fudapi`: the 404 its dispatcher would give. */
export function noFunction(): Response {
  return new Response(JSON.stringify({ status: 404, title: 'Not Found', detail: 'no such server function' }), {
    status: 404,
    headers: { 'content-type': 'application/problem+json' },
  });
}
