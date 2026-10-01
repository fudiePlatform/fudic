import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0007`. */
export interface FUD0007Params extends SourceInput {
  /** The opening delimiter the balancer expected: `(`, `[` or `{`. */
  readonly opener: string;
}

/** The balancer was asked to scan a group that does not start with its opener (SDD-02). */
export const FUD0007 = (p: FUD0007Params): SourceDiagnostic =>
  source('FUD0007', 'error', `Expected '${p.opener}' at the opening offset`, p);
