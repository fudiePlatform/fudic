import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A route whose client half reads `data` and that declares no `load` (SDD-39). */
export const FUD0621 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0621',
    'warning',
    'This route reads `data` and no `.fudapi` it links declares `load`: what it finds there is `undefined`, always.',
    p,
  );
