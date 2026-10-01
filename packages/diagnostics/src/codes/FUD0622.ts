import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0622`. */
export interface FUD0622Params {
  /** The route pattern. */
  readonly pattern: string;
  /** The chunk name the route would get, which is also a component tag. */
  readonly name: string;
}

/** A route whose chunk name is already a component tag (SDD-39). */
export const FUD0622 = (p: FUD0622Params): ProjectDiagnostic =>
  project(
    'FUD0622',
    'error',
    `the chunk of route ${p.pattern} would be named "${p.name}", which is already a component tag`,
  );
