import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0976`. */
export interface FUD0976Params {
  /** Where `fudic-workbench run` looked: the folder, or the paths it was given. */
  readonly where: string;
}

/** `fudic-workbench run` found no criteria to run (BUG-48). */
export const FUD0976 = (p: FUD0976Params): ProjectDiagnostic =>
  project('FUD0976', 'error', `no .fudspec to run in ${p.where}`);
