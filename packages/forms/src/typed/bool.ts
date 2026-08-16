/**
 * `bool` — a flag. Its empty is `false`, not `null`: an unchecked box has a value.
 *
 * On the wire this is the one that pays nothing — a byte holds eight of them — but
 * that is the transport's business. Here it is a declared type that validates.
 */

import { typeOf } from './range.js';
import { typed } from './typed.js';
import type { AnyValidator, TypedControl } from '../types.js';

const check = typeOf('bool', 'boolean');

export const bool = (
  initial?: boolean,
  validators?: readonly AnyValidator<boolean>[],
): TypedControl<boolean> =>
  typed('bool', initial === undefined ? false : initial, check, validators);
