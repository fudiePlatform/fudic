import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A template expression that writes, or an `@{ }` that writes an object's member (SDD-51). */
export const FUD0900 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0900',
    'error',
    'the view cannot write: an assignment, `++`, `--` or `delete` runs again on every render pass, and `@{ }` may only reassign a variable',
    p,
  );
