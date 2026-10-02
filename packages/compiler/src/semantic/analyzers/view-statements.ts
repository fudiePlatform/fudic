/**
 * `view-statements` (SDD-51 §3.3, §3.5, decision 138): an `@{ }` holds declarations,
 * assignments, calls, conditionals and loops. A statement off that list is `FUD0908` (a
 * `function` or `class` is `FUD0905`), and a write reassigns a variable the template owns —
 * never a member (`FUD0900`), never a name of someone else's (`FUD0901`).
 */

import type { Analyzer } from '../model.js';
import { viewFindings } from '../view-js.js';

export const viewStatements: Analyzer = {
  name: 'view-statements',
  run(input, report) {
    for (const finding of viewFindings(input)) {
      if (finding.rule === 'statement') report(finding.diagnostic);
    }
  },
};
