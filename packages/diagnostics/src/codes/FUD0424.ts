import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0424`. */
export interface FUD0424Params extends SourceInput {
  /** The directive written more than once. */
  readonly directive: '@RenderBody()' | '@RenderHead()';
}

/** A repeated `@RenderBody()` or `@RenderHead()` in a layout (SDD-21). */
export const FUD0424 = (p: FUD0424Params): SourceDiagnostic =>
  source('FUD0424', 'error', `a layout has at most one ${p.directive}`, p);
