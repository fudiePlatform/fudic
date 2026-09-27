/** `str` — text. Its empty is `''`, which is what an empty input holds. */

import { typeOf } from './range.js';
import { typed } from './typed.js';
import type { AnyValidator, ControlOptions, TypedControl } from '../types.js';

const check = typeOf('str', 'string');

export const str = (
  initial?: string,
  validators?: readonly AnyValidator<string>[],
  options?: ControlOptions,
): TypedControl<string> =>
  typed('str', initial === undefined ? '' : initial, check, validators, options);
