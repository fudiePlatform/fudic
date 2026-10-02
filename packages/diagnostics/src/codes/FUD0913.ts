import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A loop with no exit, or an array allocation of unbounded size, in the view (SDD-51). */
export const FUD0913 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0913',
    'error',
    'this has no bound the view can see: on the server it blocks every request',
    p,
  );
