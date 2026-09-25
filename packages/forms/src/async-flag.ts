/**
 * The mark that says "this rule answers later", and the question the validity asks about it.
 *
 * A rule is only known to be asynchronous once it has been called, and the validity must never
 * call one (BUG-42 §4.3, §7): reading `valid()` in a view would put a request on the wire at
 * every keystroke. So the author says it when declaring the rule, and the validity reads the
 * rule's verdict instead of running it.
 *
 * It lives apart from `asyncValidator` for the same reason `server-flag.ts` does: a control asks
 * the question without importing the factory.
 */

const ASYNC = Symbol('fud.async');

interface Marked {
  [ASYNC]?: true;
}

/** Marks a rule as asynchronous. Used by `asyncValidator`, and by nothing else. */
export const markAsync = <F>(fn: F): F => {
  (fn as Marked)[ASYNC] = true;
  return fn;
};

/** Whether the validity must read this rule's verdict instead of running it. */
export const isAsync = (fn: unknown): boolean => (fn as Marked)[ASYNC] === true;
