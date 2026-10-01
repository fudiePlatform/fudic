import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0804`; `file` is the package (its name, or its root when it has none). */
export interface FUD0804Params extends FileInput {
  /** The directory `fudic.runtime` declares. */
  readonly declared: string;
}

/** A package declares `fudic.runtime` and that directory is missing or empty (SDD-45). */
export const FUD0804 = (p: FUD0804Params): FileDiagnostic =>
  file(
    'FUD0804',
    'error',
    `the package "${p.file}" declares fudic.runtime "${p.declared}", and that directory ` +
      'does not exist or holds no piece. A package that declares it produces one bundled ' +
      'file per piece there in its own build, and this build links those files by URL: run ' +
      "the publisher's build, or remove the declaration.",
    p,
  );
