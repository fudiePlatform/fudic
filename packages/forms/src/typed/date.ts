/**
 * `date` — an instant. Its empty is `null`, and an invalid `Date` is an error
 * rather than a value: `new Date('nope')` is the shape a bad input arrives in.
 */

import { dateRange } from './range.js';
import { typed } from './typed.js';
import type { TypedControl, Validator } from '../types.js';

export const date = (
  initial?: Date | null,
  validators?: readonly Validator<Date | null>[],
): TypedControl<Date | null> => typed('date', initial, dateRange, validators);
