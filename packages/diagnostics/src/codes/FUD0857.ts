import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** An `@import` written after a rule, which the browser ignores (SDD-49). */
export const FUD0857 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0857',
    'warning',
    'this @import comes after a rule, and the browser ignores it: it is dropped',
    p,
  );
