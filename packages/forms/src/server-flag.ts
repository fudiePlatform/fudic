/**
 * The mark that says "this rule only runs on the server", and the question the
 * validation walk asks about it.
 *
 * It lives apart from `serverValidator` so that a control can ask the question
 * without importing the factory: a client bundle that never declares a
 * server-only rule still has to be able to skip one, and the two ends of that
 * are one symbol wide.
 */

const SERVER = Symbol('fud.server');

interface Marked {
  [SERVER]?: true;
}

/** Marks a rule as server-only. Used by `serverValidator`, and by nothing else. */
export const markServer = <F>(fn: F): F => {
  (fn as Marked)[SERVER] = true;
  return fn;
};

/** Whether a rule must be skipped when validating on the client. */
export const isServerOnly = (fn: unknown): boolean => (fn as Marked)[SERVER] === true;
