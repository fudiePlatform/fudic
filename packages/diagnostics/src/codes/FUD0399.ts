import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0399`. */
export interface FUD0399Params {
  /** The route pattern. */
  readonly pattern: string;
}

/** A route the link pass produced no linkable chunk for (SDD-20). */
export const FUD0399 = (p: FUD0399Params): ProjectDiagnostic =>
  project('FUD0399', 'warning', `no linkable chunk for ${p.pattern}`);
