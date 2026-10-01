import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0684`. */
export interface FUD0684Params extends SourceInput {
  /** The provider registered twice. */
  readonly provider: string;
}

/** The same token provided twice in one `@code` (SDD-38). */
export const FUD0684 = (p: FUD0684Params): SourceDiagnostic =>
  source(
    'FUD0684',
    'error',
    `\`${p.provider}\` is provided twice in this @code: the second registration replaces the first, and one of the two factories never runs.`,
    p,
  );
