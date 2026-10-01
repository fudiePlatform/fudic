import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0785`. */
export interface FUD0785Params {
  /** The name `--uses` gave. */
  readonly name: string;
  /** `missing`: no such project; `app`: it is an app, which exports nothing. */
  readonly problem: 'missing' | 'app';
  /** The libraries the workspace does have. */
  readonly libraries: readonly string[];
}

/** `--uses <name>` names something that is not a workspace library (SDD-44). */
export const FUD0785 = (p: FUD0785Params): ProjectDiagnostic => {
  const list =
    p.libraries.length === 0 ? '; this workspace has no libraries' : `; libraries: ${p.libraries.join(', ')}`;
  return project(
    'FUD0785',
    'error',
    p.problem === 'missing'
      ? `--uses ${p.name}: no such project in the workspace${list}`
      : `--uses ${p.name}: that is an app, and an app exports nothing${list}`,
  );
};
