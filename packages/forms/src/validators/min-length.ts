/** `minLength` — at least `n` characters, or `n` items. Empty is `required`'s business. */

import { measure, type Sized } from './length.js';
import type { Validator } from '../types.js';

export const minLength =
  (n: number): Validator<Sized | null> =>
  (v) => {
    const size = measure(v);
    return size !== null && size < n ? { minLength: n } : null;
  };
