/**
 * `view-rest` (SDD-61 §3.6, annex A.3.3): a `...rest` of the view is no object outside JS —
 * the backends know it as its source minus the named fields. It is read by field
 * (`rest.title`), spread on a tag (`<input ...rest>`) or destructured again
 * (`const { b, ...r2 } = rest`). Any other use is `FUD1147`, on the use.
 */

import type { Analyzer } from '../model.js';
import { viewRule } from '../view-findings.js';

export const viewRest: Analyzer = {
  name: 'view-rest',
  run(input, report) {
    viewRule(input, 'rest').forEach(report);
  },
};
