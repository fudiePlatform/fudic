import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A name the view reads that the file and the template do not provide; the only global is `undefined` (SDD-51, SDD-61). */
export const FUD0907 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0907',
    'error',
    'this name is not available to the view: the only global is `undefined`; declare or import the rest in `@code`',
    p,
  );
