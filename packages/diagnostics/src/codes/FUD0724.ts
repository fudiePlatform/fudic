import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0724`. */
export interface FUD0724Params {
  /** The id declared more than once. */
  readonly id: string;
  /** The directories of the projects that declare it. */
  readonly dirs: readonly string[];
}

/** Two projects of the workspace declare the same `id` (SDD-41). */
export const FUD0724 = (p: FUD0724Params): ProjectDiagnostic =>
  project('FUD0724', 'error', `the id "${p.id}" is declared by more than one project: ${p.dirs.join(', ')}`);
