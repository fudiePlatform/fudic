import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0821`. */
export interface FUD0821Params extends SourceInput {
  /** The keyword: `@snippet` or `@render`. */
  readonly keyword: string;
}

/** A `@snippet` signature or a `@render` argument list without its parentheses (SDD-29). */
export const FUD0821 = (p: FUD0821Params): SourceDiagnostic =>
  source('FUD0821', 'error', `${p.keyword} requires parentheses`, p);
