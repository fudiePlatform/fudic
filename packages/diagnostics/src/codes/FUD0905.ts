import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A function, class, method or block-bodied arrow defined in the view (SDD-51). */
export const FUD0905 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0905',
    'error',
    'the view cannot define code: declare functions and classes in `@code`; an arrow in the view has an expression body',
    p,
  );
