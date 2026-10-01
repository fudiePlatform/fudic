import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** An `@import` the build cannot read, so it stays unflattened (SDD-49). */
export const FUD0850 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0850',
    'warning',
    'this @import names a file the build cannot read: it stays, and what it imports arrives whole, without pruning',
    p,
  );
