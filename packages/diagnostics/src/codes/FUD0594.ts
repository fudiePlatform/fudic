import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `control` binding inside a loop (SDD-34). */
export const FUD0594 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0594',
    'error',
    '`control` is not allowed inside a loop (@foreach/@for/@while): the expression would bind every row to the same form node',
    p,
  );
