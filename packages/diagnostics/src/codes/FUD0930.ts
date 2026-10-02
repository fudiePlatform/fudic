import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0930`. */
export interface FUD0930Params extends SourceInput {
  /** The block that is out of place. */
  readonly keyword: 'given' | 'when' | 'then';
}

/** A block repeated or written out of order (`.fudspec`). */
export const FUD0930 = (p: FUD0930Params): SourceDiagnostic =>
  source('FUD0930', 'error', `\`${p.keyword}\` is out of order: a criterion has given, when, then, in that order and once each`, p);
