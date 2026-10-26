import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** `as`, `satisfies`, a non-null `!`, `<T>x` or type arguments in the view (SDD-61). */
export const FUD1144 = (p: SourceInput): SourceDiagnostic =>
  source('FUD1144', 'error', 'TypeScript syntax does not belong in the view: type the value where it is declared', p);
