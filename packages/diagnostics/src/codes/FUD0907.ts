import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A name the view reads that the file, the template and the view's globals do not provide (SDD-51). */
export const FUD0907 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0907',
    'error',
    'this name is not available to the view: declare or import it in `@code`',
    p,
  );
