/**
 * `accept` — every file of a type the list accepts, in the syntax of the HTML attribute
 * (SDD-81 §3.2). Empty is `required`'s business.
 */

import { accepted, type Files } from './file-checks.js';
import type { Validator } from '../types.js';

export const accept =
  (types: string): Validator<Files> =>
  (v) =>
    accepted(v, types) ? null : { accept: types };
