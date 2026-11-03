import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD1207`. */
export interface FUD1207Params {
  /** The original message of what stopped the run. */
  readonly reason: string;
}

/** Something that is none of the known causes stopped a run (SDD-64). */
export const FUD1207 = (p: FUD1207Params): ProjectDiagnostic =>
  project('FUD1207', 'error', `could not run: ${p.reason}`);
