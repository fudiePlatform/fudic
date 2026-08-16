/** `u32` — ids, amounts in cents. 0…4 294 967 295, integer. */

import { intRange } from './range.js';
import { typed } from './typed.js';
import type { TypedControl, Validator } from '../types.js';

const check = intRange('u32', 0, 4_294_967_295);

export const u32 = (
  initial?: number | null,
  validators?: readonly Validator<number | null>[],
): TypedControl<number | null> => typed('u32', initial, check, validators);
