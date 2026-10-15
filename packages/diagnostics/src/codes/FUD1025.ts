import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Two `t()` in one context with the same text and a different number of holes (SDD-58). */
export const FUD1025 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD1025',
    'error',
    'another `t()` in this context has the same text with a different number of holes: one message cannot have both',
    p,
  );
