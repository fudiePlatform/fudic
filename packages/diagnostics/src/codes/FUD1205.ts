import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD1205`. */
export interface FUD1205Params {
  /** The first line of what the page threw. */
  readonly error: string;
}

/** The page threw while a criterion ran on it (SDD-64). */
export const FUD1205 = (p: FUD1205Params): ProjectDiagnostic =>
  project('FUD1205', 'error', `the page threw: ${p.error}`);
