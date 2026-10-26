import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** `now()` outside the whole initializer of a signal in `@code` (SDD-51, SDD-61). */
export const FUD0912 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0912',
    'error',
    '`now()` is only allowed as the whole initializer of a signal in `@code`: `signal(now())`',
    p,
  );
