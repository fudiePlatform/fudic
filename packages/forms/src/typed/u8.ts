/** `u8` — an unsigned byte. 0…255, integer. */

import { intRange } from './range.js';
import { typed } from './typed.js';
import type { TypedControl, Validator } from '../types.js';

const check = intRange('u8', 0, 255);

export const u8 = (
  initial?: number | null,
  validators?: readonly Validator<number | null>[],
): TypedControl<number | null> => typed('u8', initial, check, validators);
