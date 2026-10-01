import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `@foreach`/`@for` header that declares no binding, so its rows have no key (SDD-30). */
export const FUD0543 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0543',
    'error',
    'a loop header that declares no binding cannot have a key that identifies its rows',
    p,
  );
