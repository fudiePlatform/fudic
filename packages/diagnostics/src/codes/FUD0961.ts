import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0961`. */
export interface FUD0961Params {
  /** The term name as given. */
  readonly name: string;
}

/** `fudic g term` given a name that is not kebab-case (SDD-53). */
export const FUD0961 = (p: FUD0961Params): ProjectDiagnostic =>
  project('FUD0961', 'error', `invalid term name "${p.name}": it must be kebab-case (e.g. "min-height")`);
