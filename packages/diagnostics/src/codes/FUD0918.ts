import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A name the template declares that `@code`, the file's role or the view's globals already declare (SDD-51). */
export const FUD0918 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0918',
    'error',
    'the view redeclares a name that already means something here: a name of `@code`, `data` or a global',
    p,
  );
