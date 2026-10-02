import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** An `@{ }` that reassigns a name neither the template nor the neutral `@code` owns (SDD-51). */
export const FUD0901 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0901',
    'error',
    'an `@{ }` block may reassign only a name the template declares or a `let` of the neutral `@code`',
    p,
  );
