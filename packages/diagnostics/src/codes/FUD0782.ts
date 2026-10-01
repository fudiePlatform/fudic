import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0782`. */
export interface FUD0782Params {
  /** The name `--project` gave. */
  readonly project: string;
  /** The projects the workspace has. */
  readonly names: readonly string[];
}

/** `--project <name>` names no project of the workspace (SDD-44). */
export const FUD0782 = (p: FUD0782Params): ProjectDiagnostic =>
  project(
    'FUD0782',
    'error',
    `--project ${p.project}: no such project${
      p.names.length === 0 ? ' — there are none here' : `; there is: ${p.names.join(', ')}`
    }`,
  );
