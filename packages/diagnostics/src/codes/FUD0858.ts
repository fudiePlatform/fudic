import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** An unflattenable `@import` hoisted ahead of rules that preceded it (SDD-49). */
export const FUD0858 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0858',
    'warning',
    'this @import is moved to the top of the flattened sheet, ahead of rules that came before it: the cascade order changes',
    p,
  );
