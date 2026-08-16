/** `max` — not above `n`. An empty control is skipped, as in `min`. */

import type { Validator } from '../types.js';

export const max =
  (n: number): Validator<number | null> =>
  (v) =>
    v !== null && v > n ? { max: n } : null;
