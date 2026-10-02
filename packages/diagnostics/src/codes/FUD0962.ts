import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0962`. */
export interface FUD0962Params {
  /** The value of `--param` as given. */
  readonly param: string;
}

/** `fudic g term --param` that is not `<name>:<type>` with a known type (SDD-53). */
export const FUD0962 = (p: FUD0962Params): ProjectDiagnostic =>
  project(
    'FUD0962',
    'error',
    `invalid --param "${p.param}": expected <name>:<type>, with type element, number, string or token`,
  );
