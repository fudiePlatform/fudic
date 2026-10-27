import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A function, class, method or arrow in the view, other than the arrow of a collection operation (SDD-51, SDD-61). */
export const FUD0905 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0905',
    'error',
    'the view cannot define code: the only arrow it takes is the argument of `filter`, `map`, `reduce` or `toSorted`',
    p,
  );
