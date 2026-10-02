import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0960`. */
export interface FUD0960Params {
  /** The component as given: a tag or a name without the project's prefix. */
  readonly component: string;
}

/** `fudic g spec` names a component the project does not have (SDD-53). */
export const FUD0960 = (p: FUD0960Params): ProjectDiagnostic =>
  project('FUD0960', 'error', `component "${p.component}" not found in this project`);
