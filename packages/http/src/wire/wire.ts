/**
 * What a function's format is (SDD-67 §3.6): the bytes of its arguments, of its value and of its
 * problem, and the content types that name them. `binWire` and `jsonWire` are the two; the
 * compiler picks one per function and both ends read it from the same `FnSpec`.
 */

import type { Problem } from '../errors.js';
import type { Ty } from './ty.js';

export interface Wire {
  readonly name: 'fud-bin' | 'json';
  /** Content types of a value and of a problem. */
  readonly type: string;
  readonly problemType: string;
  /** The body of a call; undefined when it has no body arguments. */
  encodeArgs(types: Readonly<Record<string, Ty>>, args: Readonly<Record<string, unknown>>): Uint8Array | string | undefined;
  decodeArgs(types: Readonly<Record<string, Ty>>, body: Uint8Array): Record<string, unknown>;
  encodeValue(ty: Ty, value: unknown): Uint8Array | string;
  decodeValue(ty: Ty, body: Uint8Array): unknown;
  encodeProblem(problem: Problem): Uint8Array | string;
  decodeProblem(body: Uint8Array): Problem;
}
