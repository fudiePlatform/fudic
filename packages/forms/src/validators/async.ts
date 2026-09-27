/**
 * `asyncValidator` — a rule that answers with a promise, SAID so (BUG-42 §3.1).
 *
 * It runs exactly like any other rule at the moments of `validateOn` and on the submit. What the
 * mark changes is the validity: `valid()` never calls a marked rule, it reads the verdict the
 * last run left for the current value, and counts the rule as PENDING while there is none. A
 * view that disables its button with `$valid()` would otherwise send a request per keystroke.
 *
 * A loose export, like `serverValidator`, so whoever never declares one does not download it.
 */

import { markAsync } from '../async-flag.js';
import type { AnyForm, Validator } from '../types.js';

export const asyncValidator = <T, R = AnyForm>(fn: Validator<T, R>): Validator<T, R> =>
  markAsync<Validator<T, R>>((value, root) => fn(value, root));
