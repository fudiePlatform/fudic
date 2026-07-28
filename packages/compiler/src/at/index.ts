/**
 * The `@` transition rules (SDD-04). Canonical re-export.
 */

export type {
  RazorExpressionKind,
  RazorExpression,
  AtEscapeNode,
  RazorCommentNode,
  ControlKeyword,
  LayoutDirective,
  TriggerResolution,
} from './at.js';
export {
  classifyKeyword,
  classifyDirective,
  resolveTrigger,
  scanImplicitExpression,
  expressionFromToken,
  resolutionEnd,
} from './at.js';
