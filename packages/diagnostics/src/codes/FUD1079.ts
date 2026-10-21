import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1079`. */
export type FUD1079Params = SourceInput;

/** A second `chain` in one `.fudapi` (SDD-60). */
export const FUD1079 = (p: FUD1079Params): SourceDiagnostic =>
  source('FUD1079', 'error', 'a file has at most one `chain`', p);
