/**
 * The findings of the view: SDD-61's portable list. One door, so the view analyzers never walk
 * the view each.
 */

import type { SemanticInput } from './model.js';
import { portableFindings, type PortableRule } from './view-portable.js';
import type { Diagnostic } from '../types/index.js';

/** The diagnostics of `rule` over the view of `input`. */
export function viewRule(input: SemanticInput, rule: PortableRule): readonly Diagnostic[] {
  return portableFindings(input)
    .filter((finding) => finding.rule === rule)
    .map((finding) => finding.diagnostic);
}
