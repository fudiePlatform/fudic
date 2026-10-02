import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A regular expression in the view: a literal, `RegExp`, or `match`/`matchAll`/`search` (SDD-51). */
export const FUD0919 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0919',
    'error',
    'regular expressions are not allowed in the view: they keep state between passes and can hang the server',
    p,
  );
