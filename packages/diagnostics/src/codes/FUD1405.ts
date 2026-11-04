import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD1405`. */
export interface FUD1405Params {
  /** The name as it was asked for. */
  readonly name: string;
  /** The closest name that exists, when one is close enough. */
  readonly closest?: string;
}

/** `fudic_describe` or `fudic_contract` with a name the project does not have (SDD-77). */
export const FUD1405 = (p: FUD1405Params): ProjectDiagnostic =>
  project(
    'FUD1405',
    'error',
    p.closest === undefined ? `nothing in the project is called ${p.name}` : `nothing in the project is called ${p.name}; did you mean ${p.closest}?`,
  );
