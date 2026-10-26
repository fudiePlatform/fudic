/**
 * `view-statements` (SDD-51 §3.3, §3.5, decision 138; SDD-61 §3.7): what an `@{ }` may hold.
 * A statement off the list is `FUD0908` (a `function` or `class` is `FUD0905`), and a write
 * reassigns a variable the template owns — never a member (`FUD0900`), never a name of someone
 * else's (`FUD0901`). In the portable view an `@{ }` only declares and reassigns: conditionals,
 * loops, blocks and calls are `FUD0908` too.
 */

import type { Analyzer } from '../model.js';
import { viewRule } from '../view-findings.js';

export const viewStatements: Analyzer = {
  name: 'view-statements',
  run(input, report) {
    viewRule(input, 'statement').forEach(report);
  },
};
