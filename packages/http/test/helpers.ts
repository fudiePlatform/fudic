/**
 * Contexts for driving halves by hand: the fields a step reads, nothing else invented.
 */

import type { Problem } from '../src/errors.js';
import type { ClientContext, Method, ServerContext } from '../src/types.js';
import { binWire } from '../src/wire/bin.js';
import type { Ty } from '../src/wire/ty.js';

export function clientCtx(method: Method = 'PUT', name = 'save'): ClientContext {
  return {
    side: 'client',
    method,
    name,
    url: new URL('https://app.test/_fudic/fn/routes/usuarios/save'),
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
    url: new URL('https://app.test/_fudic/fn/routes/usuarios/save'),
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

/** The bytes of a response. */
export const bytesOf = async (res: Response): Promise<Uint8Array> => new Uint8Array(await res.arrayBuffer());

/** A value in `fud-bin`, read by its type. */
export const binValue = async (res: Response, ty: Ty): Promise<unknown> => binWire.decodeValue(ty, await bytesOf(res));

/** A problem in `fud-bin`. */
export const binProblem = async (res: Response): Promise<Problem> => binWire.decodeProblem(await bytesOf(res));

/** The body of a call in `fud-bin`, with its content type. */
export const binBody = (types: Readonly<Record<string, Ty>>, args: Readonly<Record<string, unknown>>): { headers: Record<string, string>; body: BodyInit } => ({
  headers: { 'content-type': binWire.type },
  body: binWire.encodeArgs(types, args) as BodyInit,
});
