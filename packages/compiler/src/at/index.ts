/**
 * The `@` transition rules (SDD-04). Canonical re-export.
 */

export type {
  RazorExpressionKind,
  RazorExpression,
  ControlKeyword,
  TriggerResolution,
} from './at.js';
export {
  classifyKeyword,
  resolveTrigger,
  scanImplicitExpression,
  expressionFromToken,
  resolutionEnd,
} from './at.js';
