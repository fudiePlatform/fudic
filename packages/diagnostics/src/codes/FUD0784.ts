import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0784`; `file` is the existing project, relative to the working directory. */
export type FUD0784Params = FileInput &
  (
    | {
        /** A project of the workspace already has the name. */
        readonly taken: 'name';
        readonly name: string;
        /** Where it is, relative to the workspace root. */
        readonly at: string;
      }
    | {
        /** The target directory already holds a `fudic.json`. */
        readonly taken: 'directory';
        /** The directory, relative to the workspace root. */
        readonly at: string;
      }
  );

/** A project already exists under that name or in that directory, without `--force` (SDD-44). */
export const FUD0784 = (p: FUD0784Params): FileDiagnostic =>
  file(
    'FUD0784',
    'error',
    p.taken === 'name'
      ? `a project named "${p.name}" is already at ${p.at}; ` + 'pass --force to overwrite'
      : `${p.at} is already a fudic project; pass --force to overwrite`,
    p,
  );
