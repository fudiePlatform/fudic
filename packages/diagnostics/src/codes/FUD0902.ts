import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** `await`, `yield` or an `async` function in the view (SDD-51). */
export const FUD0902 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0902',
    'error',
    'the view renders synchronously: `await`, `yield` and `async` functions belong in `load()` or `@code`',
    p,
  );
