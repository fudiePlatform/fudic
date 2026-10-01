import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** `fudic g app` / `fudic g lib` outside a workspace (SDD-44). */
export const FUD0780 = (): ProjectDiagnostic =>
  project(
    'FUD0780',
    'error',
    'not inside a workspace: no pnpm-workspace.yaml here or above. ' +
      'Create one with `fudic new <name> --workspace`.',
  );
