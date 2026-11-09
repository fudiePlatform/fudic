import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** `multiple` on a file input bound to one `file` (SDD-81). */
export const FUD1484 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD1484',
    'error',
    'one file, many chosen: the input has `multiple` and its field is `file`; remove `multiple`, or make the field `file[]`',
    p,
  );
