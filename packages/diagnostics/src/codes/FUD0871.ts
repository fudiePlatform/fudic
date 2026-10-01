import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0871`. */
export interface FUD0871Params {
  /** Why the check could not run, as the failure reported it. */
  readonly reason: string;
}

/** The typecheck could not run, so nothing was checked and the build fails (SDD-35). */
export const FUD0871 = (p: FUD0871Params): ProjectDiagnostic =>
  project('FUD0871', 'error', `the typecheck could not run: ${p.reason}`);
