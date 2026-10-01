import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A property binding whose value concatenates parts (SDD-07). */
export const FUD0091 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0091',
    'error',
    'property binding value must not concatenate parts: use one value or one `@` expression',
    p,
  );
