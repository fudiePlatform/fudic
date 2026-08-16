/** `f64` — a decimal in 64 bits. Finite: `NaN` and `Infinity` are not values of a field. */

import { floatRange } from './range.js';
import { typed } from './typed.js';
import type { AnyValidator, TypedControl } from '../types.js';

const check = floatRange('f64', Number.MAX_VALUE);

export const f64 = (
  initial?: number | null,
  validators?: readonly AnyValidator<number | null>[],
): TypedControl<number | null> => typed('f64', initial, check, validators);
