import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `@while` or `@for` with no exit the view can see (SDD-51, SDD-61). */
export const FUD0913 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0913',
    'error',
    'this loop has no bound the view can see: on the server it blocks every request',
    p,
  );
