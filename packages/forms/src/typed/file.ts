/**
 * `file` — one file, what an `<input type="file">` holds (SDD-81 §3.6). Its empty is `null`, like
 * a date's. A `Blob` passes where a `File` is expected: it is what a `File` is made of, and what a
 * drop or a `fetch` gives.
 */

import { fileRange } from './range.js';
import { typed } from './typed.js';
import type { AnyValidator, ControlOptions, TypedControl } from '../types.js';

export const file = (
  initial?: File | null,
  validators?: readonly AnyValidator<File | null>[],
  options?: ControlOptions,
): TypedControl<File | null> => typed('file', initial, fileRange, validators, options);
