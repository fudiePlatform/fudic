/** `maxSize` — every file no bigger than `n` bytes (SDD-81 §3.2). Empty is `required`'s business. */

import { withinSize, type Files } from './file-checks.js';
import type { Validator } from '../types.js';

export const maxSize =
  (n: number): Validator<Files> =>
  (v) =>
    withinSize(v, n) ? null : { maxSize: n };
