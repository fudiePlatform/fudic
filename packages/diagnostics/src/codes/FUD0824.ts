import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `@snippet` below the top level of its file (SDD-29). */
export const FUD0824 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0824', 'error', '@snippet is a top-level node of the file: nested, it declares nothing', p);
