import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD1444`. */
export interface FUD1444Params {
  /** The sheet the project's `guide` already names. */
  readonly sheet: string;
}

/** `fudic g guide` in an app that already has a style guide (SDD-79). */
export const FUD1444 = (p: FUD1444Params): ProjectDiagnostic =>
  project('FUD1444', 'error', `the project already has a style guide (${p.sheet}): one per project`);
