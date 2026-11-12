import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0926`. */
export interface FUD0926Params extends SourceInput {
  /** The keyword the extra text follows. */
  readonly keyword: 'component' | 'page' | 'flow' | 'criterion' | 'given' | 'when' | 'then';
}

/** Text after a structural line that takes nothing more (`.fudspec`) (SDD-52, SDD-82). */
export const FUD0926 = (p: FUD0926Params): SourceDiagnostic =>
  source('FUD0926', 'error', `unexpected text after \`${p.keyword}\``, p);
