/**
 * The `ctx` the server half of a chain receives (SDD-56 §4.6, step 2).
 *
 * Built from a `Request` when there is one. The prerender has none (§4.14): a GET with no
 * headers, no cookies and a signal that never aborts.
 *
 * It notes whether the session was read (SDD-69 §3.2): any read of `cookies`, or `get`/`has`
 * of the `cookie` or `authorization` header. The note lives on `response`, the one object a
 * `ctx` hands on intact through a chain that spreads it, and whoever answers asks it there.
 */

import type { Method, ServerContext } from '../types.js';

/** What a response carries besides its body: its status and headers. */
export type PendingResponse = ServerContext['response'];

export interface ContextInput {
  readonly method: Method;
  readonly name: string;
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
  readonly args: unknown;
  /** The request being served; absent in the prerender. */
  readonly request?: Request;
  /** Where the context writes its status and headers. Default: a new one. */
  readonly response?: PendingResponse;
}

/** The responses whose context read the session. */
const readers = new WeakSet<PendingResponse>();

/** The headers that carry the session. */
const SESSION_HEADERS = new Set(['cookie', 'authorization']);

export function serverContext(input: ContextInput): ServerContext {
  const headers = input.request?.headers ?? new Headers();
  const response = input.response ?? { status: 200, headers: new Headers() };
  const read = (): void => void readers.add(response);
  return {
    side: 'server',
    method: input.method,
    name: input.name,
    url: input.url,
    params: input.params,
    headers: watchedHeaders(headers, read),
    cookies: watchedCookies(parseCookies(headers.get('cookie')), read),
    args: input.args,
    signal: input.request?.signal ?? new AbortController().signal,
    response,
  };
}

/** Every read of the map is a read of the session, even of a cookie that is not there. */
function watchedCookies(cookies: Map<string, string>, read: () => void): ReadonlyMap<string, string> {
  return new Proxy(cookies, {
    get(target, key) {
      read();
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** `get` and `has` of `cookie` or `authorization` are reads of the session; any other header is not. */
function watchedHeaders(headers: Headers, read: () => void): Headers {
  return new Proxy(headers, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      if (key !== 'get' && key !== 'has') return value.bind(target);
      return (name: string) => {
        if (SESSION_HEADERS.has(name.toLowerCase())) read();
        return (value as (name: string) => unknown).call(target, name);
      };
    },
  });
}

/** Whether the context that wrote `response` read the session. */
export function readsSession(response: PendingResponse): boolean {
  return readers.has(response);
}

/**
 * `Cache-Control: private, no-store` on a response whose context read the session, unless the
 * handler set its own: what depended on who is asking is kept by no cache.
 */
export function markPrivate(response: PendingResponse): void {
  if (readsSession(response) && !response.headers.has('cache-control')) {
    response.headers.set('cache-control', 'private, no-store');
  }
}

/** `a=1; b=2` → `{ a: '1', b: '2' }`. A pair without `=` is skipped; values are decoded. */
export function parseCookies(header: string | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const pair of (header ?? '').split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    out.set(pair.slice(0, eq).trim(), decode(pair.slice(eq + 1).trim()));
  }
  return out;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value; // a malformed escape is kept as written rather than losing the cookie
  }
}
