/** `i16` — −32 768…32 767, integer. */

import { intRange } from './range.js';
import { typed } from './typed.js';
import type { TypedControl, Validator } from '../types.js';

const check = intRange('i16', -32_768, 32_767);

export const i16 = (
  initial?: number | null,
  validators?: readonly Validator<number | null>[],
): TypedControl<number | null> => typed('i16', initial, check, validators);
