import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `control` value that is not a single `@` expression (SDD-34). */
export const FUD0590 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0590',
    'error',
    'control value must be a single `@` expression naming a form node, e.g. `control="@f.title"`',
    p,
  );
