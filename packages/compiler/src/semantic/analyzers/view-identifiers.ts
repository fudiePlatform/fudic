/**
 * `view-identifiers` (SDD-51 §3.4, decision 137; SDD-61 §3.2): a name the view reads and does
 * not declare resolves to the template, to `@code`, to what the file's role provides (`data`)
 * or to a global. SDD-51 allows a short list of globals; the portable view, `undefined` alone.
 * Anything else is `FUD0907`. A handler only keeps the rule of the names an `@{ }` declares.
 */

import type { Analyzer } from '../model.js';
import { viewRule } from '../view-findings.js';

export const viewIdentifiers: Analyzer = {
  name: 'view-identifiers',
  run(input, report) {
    viewRule(input, 'identifier').forEach(report);
  },
};
