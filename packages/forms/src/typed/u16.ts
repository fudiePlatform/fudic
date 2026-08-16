/** `u16` — quantities, table numbers. 0…65 535, integer. */

import { intRange } from './range.js';
import { typed } from './typed.js';
import type { TypedControl, Validator } from '../types.js';

const check = intRange('u16', 0, 65_535);

export const u16 = (
  initial?: number | null,
  validators?: readonly Validator<number | null>[],
): TypedControl<number | null> => typed('u16', initial, check, validators);
