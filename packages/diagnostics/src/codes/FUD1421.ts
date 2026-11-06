import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD1421`. */
export interface FUD1421Params {
  /** The component's tag. */
  readonly tag: string;
  /** The case as it was asked for. */
  readonly name: string;
  /** The cases its fixture has. */
  readonly cases: readonly string[];
}

/** `fixture` or `cases` naming a case the fixture does not have (SDD-78). */
export const FUD1421 = (p: FUD1421Params): ProjectDiagnostic =>
  project('FUD1421', 'error', `the fixture of ${p.tag} has no case "${p.name}"; its cases are: ${p.cases.join(', ')}`);
