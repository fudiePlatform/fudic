import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A snippet whose body renders itself with no control construct in between (SDD-51). */
export const FUD0914 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0914',
    'error',
    'this snippet renders itself with no condition in between: the expansion never ends',
    p,
  );
