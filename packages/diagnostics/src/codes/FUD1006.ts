import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** `form:=` on an element that is not a `<form>` with `control=` (SDD-56). */
export const FUD1006 = (p: SourceInput): SourceDiagnostic =>
  source('FUD1006', 'error', '`form:=` goes on a `<form>` that has `control=`: it sends the form that `control=` binds', p);
