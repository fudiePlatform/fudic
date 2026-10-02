import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** An expression whose value is not the same on both sides, or a non-primitive key (SDD-51). */
export const FUD0912 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0912',
    'error',
    'this value differs between the server and the browser, or between two passes: the hydration will not match',
    p,
  );
