import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** No target project: no `--project`, and no `fudic.json` at or above the directory (SDD-44). */
export const FUD0781 = (): ProjectDiagnostic =>
  project(
    'FUD0781',
    'error',
    'no target project: there is no fudic.json here or above. ' +
      'Run this inside a project, or name one with --project.',
  );
