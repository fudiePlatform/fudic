import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** The comma operator in the view (SDD-51). */
export const FUD0906 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0906',
    'error',
    'the comma operator throws its first value away: the only reason to write it is a side effect',
    p,
  );
