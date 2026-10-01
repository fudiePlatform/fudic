import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0002`. */
export interface FUD0002Params extends SourceInput {
  /** The closing delimiter that never came: `)`, `]` or `}`. */
  readonly closer: string;
}

/** A balanced group that runs to the end of the source (SDD-02). */
export const FUD0002 = (p: FUD0002Params): SourceDiagnostic =>
  source('FUD0002', 'error', `Unterminated group, expected '${p.closer}'`, p);
