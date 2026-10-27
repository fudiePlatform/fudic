import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A reflective member in the view: `.constructor`, `__proto__` or `prototype` (SDD-51, SDD-61). */
export const FUD0910 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0910',
    'error',
    'reflective access reaches `Function` and the prototypes: the view reads values, not their machinery',
    p,
  );
