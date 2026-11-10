/**
 * `files` — the files of one `<input multiple>` (SDD-81 §3.6). ONE control and not a list of
 * `file` controls: a dialog of the system hands back a list, never an item at a time. Its empty
 * is `[]`, never `null`.
 */

import { filesRange } from './range.js';
import { typed } from './typed.js';
import type { AnyValidator, ControlOptions, TypedControl } from '../types.js';

export const files = (
  initial?: readonly File[],
  validators?: readonly AnyValidator<readonly File[]>[],
  options?: ControlOptions,
): TypedControl<readonly File[]> => typed('file[]', initial === undefined ? [] : initial, filesRange, validators, options);
