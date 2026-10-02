import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0934`. */
export interface FUD0934Params extends SourceInput {
  /** The empty block. */
  readonly keyword: 'given' | 'when' | 'then';
}

/** A block with no term lines (`.fudspec`). */
export const FUD0934 = (p: FUD0934Params): SourceDiagnostic =>
  source('FUD0934', 'error', `\`${p.keyword}\` is empty: write at least one term under it`, p);
