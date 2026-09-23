/**
 * The one place where a validator is called, and the one cast in the package that
 * exists for a type and not for a runtime shape.
 *
 * A validator list is declared as `AnyValidator<T>` — root `never` — so that a
 * rule written with its own root type is accepted without a cast at the call site
 * of `control()` or `group()`. Nothing can be passed to a `never` parameter, so
 * the actual call is made through the wide signature. The whole point of the
 * arrangement is where the cast lands: ONE inside the library, none in the rules
 * outside it.
 */

import type { AnyForm, AnyValidator, Errors, Validator } from './types.js';

export const runRule = <T>(
  rule: AnyValidator<T>,
  value: T,
  root: AnyForm,
): Errors | null | Promise<Errors | null> => (rule as Validator<T, AnyForm>)(value, root);

/** Whether a rule answered later rather than now. */
export const isPending = <T>(v: T | Promise<T>): v is Promise<T> =>
  typeof (v as { then?: unknown } | null)?.then === 'function';

/**
 * The first rule that fails, in order — and SYNCHRONOUSLY for as long as the rules
 * are (BUG-41 §4.2).
 *
 * The walk only turns asynchronous at the first rule that returns a promise. That
 * is what lets a submit decide on the rules that CAN be decided now: a `required`
 * on an empty field is known the instant it runs, and waiting a microtask for it is
 * how a form ended up sent before its own validation answered.
 */
export function firstFailure<T>(
  rules: readonly AnyValidator<T>[],
  value: T,
  root: AnyForm,
): Errors | null | Promise<Errors | null> {
  for (const [i, rule] of rules.entries()) {
    const result = runRule(rule, value, root);
    if (isPending(result)) {
      return result.then(
        (found) => found ?? firstFailure(rules.slice(i + 1), value, root),
      );
    }
    // One error per field, not a list: the first failure stops the run.
    if (result) return result;
  }
  return null;
}
