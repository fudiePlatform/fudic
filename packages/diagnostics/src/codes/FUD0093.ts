import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0093`. */
export interface FUD0093Params extends SourceInput {
  /** Which conditional binding it is. */
  readonly kind: 'class' | 'style';
}

/** A `class:`/`style:` binding whose value is not a single `@` expression (SDD-07). */
export const FUD0093 = (p: FUD0093Params): SourceDiagnostic =>
  source('FUD0093', 'error', `\`${p.kind}:\` binding value must be a single \`@\` expression`, p);
