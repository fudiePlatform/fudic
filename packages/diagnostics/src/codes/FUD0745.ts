import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `shadowrootadoptedstylesheets` that is not a literal list of names (SDD-46). */
export const FUD0745 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0745',
    'error',
    '`shadowrootadoptedstylesheets` must be a literal list of names: the sheets are chosen when the component is compiled',
    p,
  );
