/** `i32` — −2 147 483 648…2 147 483 647, integer. */

import { intRange } from './range.js';
import { typed } from './typed.js';
import type { AnyValidator, TypedControl } from '../types.js';

const check = intRange('i32', -2_147_483_648, 2_147_483_647);

export const i32 = (
  initial?: number | null,
  validators?: readonly AnyValidator<number | null>[],
): TypedControl<number | null> => typed('i32', initial, check, validators);
