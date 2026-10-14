/**
 * The `ctx` the server half of a chain receives (SDD-56 §4.6, step 2).
 *
 * Built from a `Request` when there is one. The prerender has none (§4.14): a GET with no
 * headers, no cookies and a signal that never aborts.
 */

import type { Method, ServerContext } from '../types.js';

export interface ContextInput {
  readonly method: Method;
  readonly name: string;
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
  readonly args: unknown;
  /** The request being served; absent in the prerender. */
  readonly request?: Request;
}

export function serverContext(input: ContextInput): ServerContext {
  const headers = input.request?.headers ?? new Headers();
  return {
    side: 'server',
    method: input.method,
    name: input.name,
    url: input.url,
    params: input.params,
    headers,
    cookies: parseCookies(headers.get('cookie')),
    args: input.args,
    signal: input.request?.signal ?? new AbortController().signal,
    response: { status: 200, headers: new Headers() },
  };
}

/** `a=1; b=2` → `{ a: '1', b: '2' }`. A pair without `=` is skipped; values are decoded. */
export function parseCookies(header: string | null): ReadonlyMap<string, string> {
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
