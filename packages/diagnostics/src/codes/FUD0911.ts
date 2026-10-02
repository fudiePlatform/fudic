import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A call to a mutating method on state the render pass does not own (SDD-51). */
export const FUD0911 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0911',
    'error',
    'this method changes an object the render pass does not own: it would run again on every pass, on both sides',
    p,
  );
