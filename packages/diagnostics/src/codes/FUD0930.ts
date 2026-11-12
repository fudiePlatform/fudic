import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0930`. */
export interface FUD0930Params extends SourceInput {
  /** The block that is out of place. */
  readonly keyword: 'given' | 'when' | 'then';
}

/** A `given` after another block, or the same block twice in a row (`.fudspec`) (SDD-52, SDD-82). */
export const FUD0930 = (p: FUD0930Params): SourceDiagnostic =>
  source('FUD0930', 'error', `\`${p.keyword}\` is out of order: \`given\` goes first and once, then \`when\` and \`then\` take turns`, p);
