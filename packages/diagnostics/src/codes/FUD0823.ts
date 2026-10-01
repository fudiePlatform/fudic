import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0823`. */
export interface FUD0823Params extends SourceInput {
  /** Where the `@code` was written: inside a `@snippet` body, or at the top of a snippet file. */
  readonly where: 'snippet' | 'file';
}

/** A `@code` inside a snippet body or a file of snippets (SDD-29). */
export const FUD0823 = (p: FUD0823Params): SourceDiagnostic =>
  source(
    'FUD0823',
    'error',
    p.where === 'file'
      ? 'a file of snippets has no @code: a snippet has no state of its own and nothing here would run it'
      : 'a @snippet has no @code: it has no state of its own, and every value in its markup arrives as an argument',
    p,
  );
