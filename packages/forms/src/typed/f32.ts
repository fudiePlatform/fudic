/** `f32` — a decimal in 32 bits. Finite and within the width, not exactly representable. */

import { F32_MAX, floatRange } from './range.js';
import { typed } from './typed.js';
import type { AnyValidator, TypedControl } from '../types.js';

const check = floatRange('f32', F32_MAX);

export const f32 = (
  initial?: number | null,
  validators?: readonly AnyValidator<number | null>[],
): TypedControl<number | null> => typed('f32', initial, check, validators);
