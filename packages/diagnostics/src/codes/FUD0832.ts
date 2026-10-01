import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A positional `@render` argument written after a named one (SDD-29). */
export const FUD0832 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0832',
    'error',
    'a positional argument cannot follow a named one: positionals first, names after',
    p,
  );
