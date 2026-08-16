/**
 * `validator` — typed identity.
 *
 * It exists so a rule written apart from its control gets its parameters inferred
 * instead of annotated, and for nothing else: a validator IS a function, and this
 * package never wraps one.
 *
 * `R` travels through, so `validator<string, Post>(…)` keeps the typed root the
 * author asked for instead of flattening it back to the untyped form.
 */

import type { AnyForm, Validator } from '../types.js';

export const validator = <T, R = AnyForm>(fn: Validator<T, R>): Validator<T, R> => fn;
