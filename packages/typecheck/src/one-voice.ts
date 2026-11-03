/**
 * One fact, one voice: where a fudic error already speaks, TypeScript is silent.
 *
 * The projection turns a `.fud` into TypeScript, so a mistake fudic diagnoses — an undeclared
 * tag, a handler written as text, a `@render` with the wrong arguments — is very often a type
 * error of the projection too, on the same stretch. Both would say one thing, and only fudic's
 * says how to fix it in the `.fud`. Once it is fixed, any TypeScript error that was really about
 * something else is still there to report.
 */

import type { Span } from '@fudic/diagnostics';

/** Whether two stretches of one file meet. An empty one meets what starts or ends at it. */
function meet(a: Span, b: Span): boolean {
  return (a.start < b.end && b.start < a.end) || a.start === b.start || a.end === b.end;
}

/** Whether a TypeScript diagnostic at `at` repeats one of the fudic errors spoken at `spoken`. */
export function echoes(at: Span, spoken: readonly Span[]): boolean {
  return spoken.some((span) => meet(span, at));
}
