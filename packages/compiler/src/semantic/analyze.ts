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
import { reservedAttributes } from './analyzers/reserved-attributes.js';
import { refInLoop } from './analyzers/ref-in-loop.js';
import { delegation } from './analyzers/delegation.js';
import { controlInLoop } from './analyzers/control-in-loop.js';
import { controlElement } from './analyzers/control-element.js';
import { controlUniqueness } from './analyzers/control-uniqueness.js';
import { controlInsideForm } from './analyzers/control-inside-form.js';
import { errorMarker } from './analyzers/error-marker.js';
import { formAssociatedPlacement } from './analyzers/form-associated-placement.js';
import { primitiveInterpolation } from './analyzers/primitive-interpolation.js';
import { componentDeclared } from './analyzers/component-declared.js';
import { eventHandlerShape } from './analyzers/event-handler-shape.js';
import { layoutLoad } from './analyzers/layout-load.js';
import { layoutBody } from './analyzers/layout-body.js';
import { scriptBody } from './analyzers/script-body.js';
import { hostBindings } from './analyzers/host-bindings.js';
import { viewExpressions } from './analyzers/view-expressions.js';
import { viewStatements } from './analyzers/view-statements.js';
import { viewIdentifiers } from './analyzers/view-identifiers.js';
import { viewRest } from './analyzers/view-rest.js';
import { viewControl } from './analyzers/view-control.js';
import { serverCut } from './analyzers/server-cut.js';
import { nativeEventAttributes } from './analyzers/native-event-attributes.js';
import { viewAttributes } from './analyzers/view-attributes.js';
import { snippetRecursion } from './analyzers/snippet-recursion.js';
import { rawOnlyChild } from './analyzers/raw-only-child.js';
import { spreadTarget } from './analyzers/spread-target.js';
import { translations } from './analyzers/translations.js';

/** The ordered list of analyzers (§4). One rule per unit. */
export const ANALYZERS: readonly Analyzer[] = [
  duplicateAttributes,
  reservedAttributes,
  refInLoop,
  delegation,
  controlInLoop,
  controlElement,
  controlUniqueness,
  controlInsideForm,
  errorMarker,
  formAssociatedPlacement,
  primitiveInterpolation,
  componentDeclared,
  eventHandlerShape,
  layoutLoad,
  layoutBody,
  scriptBody,
  hostBindings,
  viewExpressions,
  viewStatements,
  viewIdentifiers,
  viewRest,
  viewControl,
  serverCut,
  nativeEventAttributes,
  viewAttributes,
  snippetRecursion,
  rawOnlyChild,
  spreadTarget,
  translations,
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
