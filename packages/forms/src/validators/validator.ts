/**
 * `validator` — typed identity.
 *
 * It exists so a rule written apart from its control gets its parameters inferred
 * instead of annotated, and for nothing else: a validator IS a function, and this
 * package never wraps one.
 */

import type { Validator } from '../types.js';

export const validator = <T>(fn: Validator<T>): Validator<T> => fn;
