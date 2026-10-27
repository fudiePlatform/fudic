import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A collection operation in a form that does not port (SDD-61). */
export const FUD1145 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD1145',
    'error',
    'this collection operation does not port: pass a one-expression arrow with plain parameters, and give `reduce` its initial value',
    p,
  );
