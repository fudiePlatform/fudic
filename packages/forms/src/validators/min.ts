/**
 * `min` — not below `n`.
 *
 * An empty control is skipped, and here that is not a nicety: `null < 1` is `true`
 * in JavaScript, so without the guard every untouched number field would be in
 * error before the user reached it.
 */

import type { Validator } from '../types.js';

export const min =
  (n: number): Validator<number | null> =>
  (v) =>
    v !== null && v < n ? { min: n } : null;
