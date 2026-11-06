import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD1424`. */
export interface FUD1424Params {
  /** What Vite said. */
  readonly reason: string;
}

/** The dev server of the preview did not start (SDD-78). */
export const FUD1424 = (p: FUD1424Params): ProjectDiagnostic =>
  project('FUD1424', 'error', `the preview did not start: ${p.reason}`);
