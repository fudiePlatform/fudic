import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0950`. */
export interface FUD0950Params extends SourceInput {
  readonly fixture: string;
  /** Every fixture the file declares. */
  readonly available: readonly string[];
}

/** `props <fixture>` names a key the fixture file does not have (SDD-52). */
export const FUD0950 = (p: FUD0950Params): SourceDiagnostic =>
  source('FUD0950', 'error', `unknown fixture "${p.fixture}"; fixtures: [${p.available.join(', ')}]`, p);
