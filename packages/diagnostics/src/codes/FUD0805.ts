import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0805`; `file` is the second claimant's piece. */
export interface FUD0805Params extends FileInput {
  /** The two packages, in sorted order. */
  readonly a: string;
  readonly b: string;
  /** The URL both would publish. */
  readonly url: string;
}

/** Two packages would publish the same runtime URL (SDD-45). */
export const FUD0805 = (p: FUD0805Params): FileDiagnostic =>
  file(
    'FUD0805',
    'error',
    `the packages "${p.a}" and "${p.b}" would both publish "${p.url}". Two packages ` +
      'whose names end in the same segment and whose versions are equal claim one file in ' +
      'the output, and whichever is copied last decides what every page that names it ' +
      'receives: rename one of them, or keep only one in the dependency graph.',
    p,
  );
