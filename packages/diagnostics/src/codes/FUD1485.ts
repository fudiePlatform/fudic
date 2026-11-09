import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A file input without `multiple` bound to a `file[]` (SDD-81). */
export const FUD1485 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD1485',
    'error',
    'many files, one chosen: the field is `file[]` and the input has no `multiple`; add `multiple`, or make the field `file`',
    p,
  );
