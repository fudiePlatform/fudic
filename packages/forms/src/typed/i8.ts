/** `i8` — a signed byte. −128…127, integer. */

import { intRange } from './range.js';
import { typed } from './typed.js';
import type { AnyValidator, TypedControl } from '../types.js';

const check = intRange('i8', -128, 127);

export const i8 = (
  initial?: number | null,
  validators?: readonly AnyValidator<number | null>[],
): TypedControl<number | null> => typed('i8', initial, check, validators);
