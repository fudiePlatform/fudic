/**
 * `view-expressions` (SDD-51 §3.2, decision 137; SDD-61 §3.2–§3.5 bis, decision 162): every
 * expression the view evaluates is built from the forms the white list enumerates. A write,
 * asynchrony, a module, implicit context, code defined in place or a comma operator is
 * `FUD0900`, `FUD0902`–`FUD0906`; in the portable view also a call that is not a reactive read
 * nor a collection operation (`FUD1140`), `new` (`FUD1141`), an operator that does not port
 * (`FUD1142`), a literal the view cannot hold (`FUD1143`), TypeScript syntax (`FUD1144`), a
 * collection operation out of its form (`FUD1145`) and an array or computed-key pattern
 * (`FUD1146`).
 *
 * The walk is shared with the other view rules; this analyzer reports the findings that are
 * about what an expression IS.
 */

import type { Analyzer } from '../model.js';
import { viewRule } from '../view-findings.js';

export const viewExpressions: Analyzer = {
  name: 'view-expressions',
  run(input, report) {
    viewRule(input, 'expression').forEach(report);
  },
};
