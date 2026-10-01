import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0482`. The span covers the whole file, which is returned unchanged. */
export interface FUD0482Params extends SourceInput {
  /** What was thrown underneath the formatter. */
  readonly error: unknown;
}

/** The formatter itself failed and returned the file unformatted (SDD-26). */
export const FUD0482 = (p: FUD0482Params): SourceDiagnostic =>
  source(
    'FUD0482',
    'error',
    `The formatter could not finish: ${p.error instanceof Error ? p.error.message : String(p.error)}`,
    p,
  );
