/**
 * The findings of the view, from the list the input asks for: SDD-51's, or SDD-61's portable
 * one while `portableView` switches it on (SDD-61 task 36 removes the choice). One door, so
 * the view analyzers never pick a list each.
 */

import type { SemanticInput } from './model.js';
import { viewFindings } from './view-js.js';
import { portableFindings, type PortableRule } from './view-portable.js';
import type { Diagnostic } from '../types/index.js';

/** The diagnostics of `rule` over the view of `input`. */
export function viewRule(input: SemanticInput, rule: PortableRule): readonly Diagnostic[] {
  const findings = input.portableView === true ? portableFindings(input) : viewFindings(input);
  return findings.filter((finding) => finding.rule === rule).map((finding) => finding.diagnostic);
}
