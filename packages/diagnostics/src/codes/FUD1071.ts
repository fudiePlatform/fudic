import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1071`. */
export type FUD1071Params = SourceInput & {
  /** The clause written twice: `->`, `form`, `compress`, `validity`… */
  readonly clause: string;
};

/** A `.fudapi` clause written again where only one fits (SDD-60). */
export const FUD1071 = (p: FUD1071Params): SourceDiagnostic =>
  source('FUD1071', 'error', `\`${p.clause}\` is already given: only one fits here`, p);
