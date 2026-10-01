import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0460`. The span is the attribute VALUE, which the code action replaces. */
export interface FUD0460Params extends SourceInput {
  /** The `href` as written. */
  readonly href: string;
}

/** The `href` of a `<link rel="component"|"layout">` resolves to no `.fud` file (SDD-24). */
export const FUD0460 = (p: FUD0460Params): SourceDiagnostic =>
  source('FUD0460', 'error', `Cannot resolve "${p.href}" to a .fud file`, p);
