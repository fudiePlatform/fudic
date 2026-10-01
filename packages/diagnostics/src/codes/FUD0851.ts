import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0851`. */
export interface FUD0851Params extends SourceInput {
  /** What never ended: a comment, a string, or a `{`. */
  readonly kind: 'comment' | 'string' | 'brace';
}

const WHAT: Readonly<Record<FUD0851Params['kind'], string>> = {
  comment: 'a comment that never ends',
  string: 'a string that never ends',
  brace: 'a "{" that never closes',
};

/** A stylesheet that cannot be read as CSS, so it ships whole (SDD-49). */
export const FUD0851 = (p: FUD0851Params): SourceDiagnostic =>
  source(
    'FUD0851',
    'warning',
    `this stylesheet has ${WHAT[p.kind]}: it is shipped whole, without pruning`,
    p,
  );
