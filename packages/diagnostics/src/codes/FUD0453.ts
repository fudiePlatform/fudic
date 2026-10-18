import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** `fudic dev` or `fudic preview` where there is no app to serve (BUG-50). */
export const FUD0453 = (): ProjectDiagnostic =>
  project(
    'FUD0453',
    'error',
    'no app to serve here: run it inside an app or a workspace, or name an app with --project',
  );
