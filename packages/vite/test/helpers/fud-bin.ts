/**
 * Calling a server function by hand, as its page would (SDD-67 §3.2): its body in `fud-bin`,
 * its `?a=` in base64url and its signature in `fud-sig`; and reading what it answers, a value
 * or a problem, in the same format.
 *
 * The signature is written here from the canonical text of SDD-67 §4.3, not read off the emitter:
 * a test that agrees with the emitter on it agrees with the spec, not just with itself.
 */

import { binWire } from '../../../http/dist/wire/bin.js';
import { signature } from '../../../http/dist/wire/index.js';
import type { Problem } from '../../../http/dist/errors.js';
import type { Ty } from '../../../http/dist/wire/ty.js';

export { binWire, signature };
export type { Ty };

/** The headers and body of a call whose body arguments are `args`, signed with `canonical`. */
export function binInit(
  canonical: string,
  types: Readonly<Record<string, Ty>> = {},
  args: Readonly<Record<string, unknown>> = {},
  init: RequestInit = {},
): RequestInit {
  const body = binWire.encodeArgs(types, args);
  return {
    ...init,
    headers: {
      'fud-sig': signature(canonical),
      ...(body !== undefined ? { 'content-type': binWire.type } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
    ...(body !== undefined ? { body: body as NonNullable<RequestInit['body']> } : {}),
  };
}

/** `?a=` of a GET: its arguments as a level, in base64url. */
export function binQuery(types: Readonly<Record<string, Ty>>, args: Readonly<Record<string, unknown>>): string {
  const bytes = binWire.encodeArgs(types, args) as Uint8Array;
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

const bytesOf = async (res: Response): Promise<Uint8Array> => new Uint8Array(await res.arrayBuffer());

/** A value in `fud-bin`, read by its type. */
export const binValue = async (res: Response, ty: Ty): Promise<unknown> => binWire.decodeValue(ty, await bytesOf(res));

/** A problem in `fud-bin`. */
export const binProblem = async (res: Response): Promise<Problem> => binWire.decodeProblem(await bytesOf(res));
