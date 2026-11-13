import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1547`. */
export interface FUD1547Params extends FileInput {
  readonly directive: string;
  /** The source that lets too much in; absent when the problem is the directive that is missing. */
  readonly source?: string;
}

/** The page policy lets in more than it needs (SDD-84). */
export const FUD1547 = (p: FUD1547Params): FileDiagnostic =>
  file(
    'FUD1547',
    'warning',
    p.source === undefined
      ? `the policy has no ${p.directive}: without it, what it guards is open`
      : `${p.source} in ${p.directive} lets in more than the page needs`,
    p,
  );
