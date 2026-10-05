import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0975`. */
export interface FUD0975Params {
  /** What Playwright said when the launch failed. */
  readonly reason: string;
}

/** The system Chrome could not be launched (SDD-32). */
export const FUD0975 = (p: FUD0975Params): ProjectDiagnostic =>
  project('FUD0975', 'error', `could not launch the system Chrome: ${p.reason}`);
