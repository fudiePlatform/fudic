import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0820`. */
export interface FUD0820Params extends SourceInput {
  /** The keyword the name follows: `@snippet` or `@render`. */
  readonly keyword: string;
  /** The name as written; empty when there is none. */
  readonly text: string;
}

/** A `@snippet`/`@render` whose name is missing or malformed (SDD-29). */
export const FUD0820 = (p: FUD0820Params): SourceDiagnostic =>
  source(
    'FUD0820',
    'error',
    p.text === ''
      ? `${p.keyword} expects a name`
      : `"${p.text}" is not a valid snippet name: letters, digits and underscore, never a hyphen`,
    p,
  );
