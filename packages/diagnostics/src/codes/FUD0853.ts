import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0853`. */
export interface FUD0853Params extends SourceInput {
  /** The URL as written in the `@import`. */
  readonly url: string;
}

/** A relative `@import` whose file does not exist or cannot be read (SDD-49). */
export const FUD0853 = (p: FUD0853Params): SourceDiagnostic =>
  source(
    'FUD0853',
    'error',
    `the file this @import names (${p.url}) does not exist or cannot be read: it is dropped`,
    p,
  );
