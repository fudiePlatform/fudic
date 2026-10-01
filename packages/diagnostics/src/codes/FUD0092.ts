import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** An event binding whose value is not exactly one `@` handler (SDD-07). */
export const FUD0092 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0092',
    'error',
    'event binding value must be exactly one `@` handler (a reference or a lambda)',
    p,
  );
