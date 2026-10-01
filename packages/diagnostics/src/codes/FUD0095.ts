import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0095`. */
export interface FUD0095Params extends SourceInput {
  /** Which conditional binding it is. */
  readonly kind: 'class' | 'style';
}

/** A `class:`/`style:` binding with no name after the prefix (SDD-07). */
export const FUD0095 = (p: FUD0095Params): SourceDiagnostic =>
  source('FUD0095', 'error', `\`${p.kind}:\` binding has no name after \`:\``, p);
