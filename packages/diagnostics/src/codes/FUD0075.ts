import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0075`. */
export interface FUD0075Params extends SourceInput {
  /** Which label is missing its `:`. */
  readonly label: 'case' | 'default';
}

/** A `case` or `default` label with no `:` after it (SDD-06). */
export const FUD0075 = (p: FUD0075Params): SourceDiagnostic =>
  source('FUD0075', 'error', `expected ':' to close the ${p.label} label`, p);
