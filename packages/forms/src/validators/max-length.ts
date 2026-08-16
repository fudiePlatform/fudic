/** `maxLength` — at most `n` characters, or `n` items. */

import { measure, type Sized } from './length.js';
import type { Validator } from '../types.js';

export const maxLength =
  (n: number): Validator<Sized | null> =>
  (v) => {
    const size = measure(v);
    return size !== null && size > n ? { maxLength: n } : null;
  };
