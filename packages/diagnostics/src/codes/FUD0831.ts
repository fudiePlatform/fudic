import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0831`. */
export interface FUD0831Params extends SourceInput {
  /** The argument name given twice. */
  readonly arg: string;
}

/** A snippet parameter covered twice, by position and by name (SDD-29). */
export const FUD0831 = (p: FUD0831Params): SourceDiagnostic =>
  source('FUD0831', 'error', `"${p.arg}" is given twice`, p);
