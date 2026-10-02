/**
 * `view-expressions` (SDD-51 §3.2, decision 137): every expression the view evaluates is
 * built from the forms the white list enumerates. A write, asynchrony, a module, implicit
 * context, code defined in place or a comma operator is `FUD0900`, `FUD0902`–`FUD0906`.
 *
 * The walk is `view-js`'s, shared with the other two view rules; this analyzer reports the
 * findings that are about what an expression IS.
 */

import type { Analyzer } from '../model.js';
import { viewFindings } from '../view-js.js';

export const viewExpressions: Analyzer = {
  name: 'view-expressions',
  run(input, report) {
    for (const finding of viewFindings(input)) {
      if (finding.rule === 'expression') report(finding.diagnostic);
    }
  },
};
