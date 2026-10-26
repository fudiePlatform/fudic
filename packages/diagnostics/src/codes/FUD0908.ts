import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0908`. */
export interface FUD0908Params extends SourceInput {
  /** The keyword of the statement, as written: `if`, `for`, `return`… or the callee of a call. */
  readonly keyword: string;
}

/** A statement an `@{ }` block does not allow: it only declares and reassigns (SDD-51, SDD-61). */
export const FUD0908 = (p: FUD0908Params): SourceDiagnostic =>
  source('FUD0908', 'error', `\`${p.keyword}\` is not allowed in an \`@{ }\` block: it only declares and reassigns`, p);
