import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0963`. */
export interface FUD0963Params {
  /** The repeated parameter name. */
  readonly name: string;
}

/** `fudic g term` given two `--param` with the same name (SDD-53). */
export const FUD0963 = (p: FUD0963Params): ProjectDiagnostic =>
  project('FUD0963', 'error', `--param "${p.name}" is given twice`);
