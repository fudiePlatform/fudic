/**
 * `view-identifiers` (SDD-51 §3.4, decision 137): a name the view reads and does not declare
 * resolves to the template, to `@code`, to what the file's role provides (`data`) or to the
 * short list of globals that behave the same on both sides. Anything else is `FUD0907`.
 */

import type { Analyzer } from '../model.js';
import { viewFindings } from '../view-js.js';

export const viewIdentifiers: Analyzer = {
  name: 'view-identifiers',
  run(input, report) {
    for (const finding of viewFindings(input)) {
      if (finding.rule === 'identifier') report(finding.diagnostic);
    }
  },
};
