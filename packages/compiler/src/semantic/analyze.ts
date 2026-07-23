/**
 * The semantic pass runner (SDD-12 §3). Runs every analyzer over the input and aggregates
 * their diagnostics. SOLID: adding a rule is adding an entry to `ANALYZERS`, not editing this.
 *
 * Never throws: each analyzer is a total function over the input (a fragment with no AST is
 * skipped, not an error — FUD0170 already covered it), so the runner needs no guard.
 */

import { type Diagnostic, type ParseResult, withDiagnostics } from '../types/index.js';
import type { Analyzer, SemanticInput, SemanticModel } from './model.js';
import { duplicateAttributes } from './analyzers/duplicate-attributes.js';
import { refInLoop } from './analyzers/ref-in-loop.js';
import { codeRegionUniqueness } from './analyzers/code-region-uniqueness.js';
import { codeRegionNesting } from './analyzers/code-region-nesting.js';
import { neutralImports } from './analyzers/neutral-imports.js';
import { primitiveInterpolation } from './analyzers/primitive-interpolation.js';
import { componentDeclared } from './analyzers/component-declared.js';

/** The ordered list of analyzers (§4). One rule per unit. */
export const ANALYZERS: readonly Analyzer[] = [
  duplicateAttributes,
  refInLoop,
  codeRegionUniqueness,
  codeRegionNesting,
  neutralImports,
  primitiveInterpolation,
  componentDeclared,
];

/** The empty semantic model of v1 (§3): no facts are produced yet. */
const EMPTY_MODEL: SemanticModel = {};

/** Run every analyzer over the input. Never throws. */
export function analyze(input: SemanticInput): ParseResult<SemanticModel> {
  const diagnostics: Diagnostic[] = [];
  const report = (diagnostic: Diagnostic): void => {
    diagnostics.push(diagnostic);
  };
  for (const analyzer of ANALYZERS) {
    analyzer.run(input, report);
  }
  return withDiagnostics(EMPTY_MODEL, diagnostics);
}
