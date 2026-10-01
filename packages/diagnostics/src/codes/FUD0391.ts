import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0391`. */
export interface FUD0391Params {
  /** The `shell` entry of `sw.json`. */
  readonly entry: string;
}

/** A `sw.json` shell entry the build did not produce (SDD-20, BUG-01). */
export const FUD0391 = (p: FUD0391Params): ProjectDiagnostic =>
  project('FUD0391', 'warning', `shell entry "${p.entry}" is not in the build output`);
