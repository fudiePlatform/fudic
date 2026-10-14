/**
 * Contexts for driving halves by hand: the fields a step reads, nothing else invented.
 */

import type { ClientContext, Method, ServerContext } from '../src/types.js';

export function clientCtx(method: Method = 'PUT', name = 'save'): ClientContext {
  return {
    side: 'client',
    method,
    name,
    url: new URL('https://app.test/_fudic/fn/r/usuarios/save'),
    headers: new Headers(),
    args: undefined,
    signal: new AbortController().signal,
  };
}

export function serverCtx(
  method: Method = 'PUT',
  headers: Record<string, string> = {},
): ServerContext {
  return {
    side: 'server',
    method,
    name: 'save',
    url: new URL('https://app.test/_fudic/fn/r/usuarios/save'),
    headers: new Headers(headers),
    args: undefined,
    signal: new AbortController().signal,
    params: {},
    cookies: new Map(),
    response: { status: 200, headers: new Headers() },
  };
}

/** A plain middleware that writes its name into `trace` on the way in. */
export function tracer(trace: string[], name: string) {
  return (ctx: ClientContext | ServerContext, next: (c: ClientContext | ServerContext) => Promise<unknown>) => {
    trace.push(name);
    return next(ctx);
  };
}
