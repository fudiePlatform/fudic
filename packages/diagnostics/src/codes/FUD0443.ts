import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0443`; `file` is the target, relative to the working directory. */
export interface FUD0443Params extends FileInput {
  /** `directory`: a project directory that is not empty; `file`: a file that exists. */
  readonly target: 'directory' | 'file';
}

/** A command would overwrite something that exists, and `--force` was not given (SDD-22). */
export const FUD0443 = (p: FUD0443Params): FileDiagnostic =>
  file(
    'FUD0443',
    'error',
    p.target === 'directory'
      ? `${p.file} already exists and is not empty; pass --force to overwrite`
      : `${p.file} already exists; pass --force to overwrite`,
    p,
  );
