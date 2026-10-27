import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A regular expression literal in the view (SDD-51, SDD-61). */
export const FUD0919 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0919',
    'error',
    'regular expressions are not allowed in the view: they keep state between passes and can hang the server',
    p,
  );
