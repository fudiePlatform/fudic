import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0441`. */
export interface FUD0441Params {
  /** The tag as given. */
  readonly tag: string;
}

/** `fudic g` given a tag a component of this project already defines (SDD-22). */
export const FUD0441 = (p: FUD0441Params): ProjectDiagnostic =>
  project('FUD0441', 'error', `a component named "${p.tag}" already exists in this project`);
