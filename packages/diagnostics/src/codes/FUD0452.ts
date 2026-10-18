import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0452`. */
export interface FUD0452Params {
  /** The base URL asked for, normalized: `/admin/`. */
  readonly base: string;
  /** The app of the workspace that is already served there. */
  readonly app: string;
}

/** `fudic g app` with a base URL another app of the workspace already has (BUG-50). */
export const FUD0452 = (p: FUD0452Params): ProjectDiagnostic =>
  project('FUD0452', 'error', `app "${p.app}" is already served at ${p.base}: two apps cannot share a base URL`);
