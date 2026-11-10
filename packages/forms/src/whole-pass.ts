/**
 * The mark of a pass over a whole form in the browser: `$validate()`, what a submit runs.
 *
 * A remote rule asks the server while the user types, field by field; on a submit it does not
 * (SDD-80 §4.3): the server runs every rule again in the submit, and asking first would be the
 * same request twice. So the pass says what it is, as the third argument every validator is
 * given — the `ctx` of a rule the server runs, and in the browser this mark or nothing.
 *
 * It lives apart from the remote validator so that a form can set it without importing that.
 */

const WHOLE = Symbol('fud.whole');

/** What a whole-form pass in the browser hands its validators as their third argument. */
export const WHOLE_PASS: unknown = WHOLE;

/** Whether a validator is being run by a whole-form pass, and not by a field on its own. */
export const isWholePass = (ctx: unknown): boolean => ctx === WHOLE;
