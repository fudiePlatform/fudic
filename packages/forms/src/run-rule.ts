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

import { isAsync } from './async-flag.js';
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

/** The union of a list of verdicts, in order: the first rule to name a key keeps it. */
const union = (found: readonly (Errors | null)[]): Errors | null => {
  const out: Record<string, unknown> = {};
  for (const errors of found) {
    for (const [key, value] of Object.entries(errors ?? {})) {
      if (!(key in out)) out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
};

/** What every rule of a summary said: what is known now, and the whole of it when some answer later. */
export interface Failures {
  /** The union of the rules that answered synchronously. */
  readonly now: Errors | null;
  /** The union of ALL of them, when some rule answered with a promise. */
  readonly later?: Promise<Errors | null>;
}

/**
 * EVERY rule that fails, in order (BUG-42 §4.6). What a summary runs: a form or a group says all
 * that is wrong with it, where a field says one thing (`firstFailure`, SDD-33 §4.5).
 *
 * What the synchronous rules decide is handed back at once, so a submit still decides on what is
 * known now (BUG-41 §4.2); the full union follows when some rule answered later.
 */
export function allFailures<T>(
  rules: readonly AnyValidator<T>[],
  value: T,
  root: AnyForm,
): Failures {
  const results = rules.map((rule) => runRule(rule, value, root));
  const now = union(results.filter((r): r is Errors | null => !isPending(r)));
  if (!results.some(isPending)) return { now };
  return { now, later: Promise.all(results).then(union) };
}

/**
 * Whether the rules hold for `value` NOW — the live half of the validity (BUG-42 §4.3).
 *
 * Publishes nothing and launches nothing. A rule marked `asyncValidator` is never called: it
 * holds only when `settled` says it has a verdict for the current value, and a failing verdict
 * is on record as a published error, which the caller reads. An unmarked rule that answers with
 * a promise is PENDING and is not awaited: the author has to say which rules are asynchronous.
 */
export function holds<T>(
  rules: readonly AnyValidator<T>[],
  value: T,
  root: AnyForm,
  settled: (rule: AnyValidator<T>) => boolean,
): boolean {
  return rules.every((rule) => {
    if (isAsync(rule)) return settled(rule);
    const result = runRule(rule, value, root);
    return !isPending(result) && result === null;
  });
}
