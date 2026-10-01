import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0432`. */
export interface FUD0432Params extends SourceInput {
  /** The directive as written, with its `@`: `@RenderBody`. */
  readonly directive: string;
}

/** A `Render*` directive written without its mandatory parentheses (SDD-21). */
export const FUD0432 = (p: FUD0432Params): SourceDiagnostic =>
  source('FUD0432', 'error', `${p.directive} requires parentheses: write ${p.directive}()`, p);
