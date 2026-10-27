/**
 * `view-control` (SDD-61 §3.7): a `case` of `@switch` matches a literal, because `@switch`
 * lowers to `switch`, `match` or a chain of `if` and most of those only take constants. A
 * name or an expression is `FUD1148`, on the `case` value.
 */

import type { Analyzer } from '../model.js';
import { viewRule } from '../view-findings.js';

export const viewControl: Analyzer = {
  name: 'view-control',
  run(input, report) {
    viewRule(input, 'control').forEach(report);
  },
};
