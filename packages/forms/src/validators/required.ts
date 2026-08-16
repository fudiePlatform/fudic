/**
 * `required` — there is a value here.
 *
 * Empty is the empty string and `null`, which is what an untouched control holds
 * (`undefined` never reaches a control). `false` is NOT empty: an unchecked box
 * has a value, and a checkbox that must be ticked is a rule of its own.
 */

import type { Errors, Validator } from '../types.js';

const EMPTY: Errors = { required: true };

export const required: Validator<unknown> = (v) => (v === '' || v === null ? EMPTY : null);
