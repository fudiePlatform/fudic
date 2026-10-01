import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0908`. */
export interface FUD0908Params extends SourceInput {
  /** The keyword of the statement, as written: `return`, `var`, `throw`… */
  readonly keyword: string;
}

/** A statement an `@{ }` block does not allow (SDD-51). */
export const FUD0908 = (p: FUD0908Params): SourceDiagnostic =>
  source('FUD0908', 'error', `\`${p.keyword}\` is not allowed in an \`@{ }\` block`, p);
