import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0451`. */
export interface FUD0451Params {
  /** The command line, whole, so it can be re-run by hand. */
  readonly line: string;
  /** The exit code, or `null` when the process never started. */
  readonly status: number | null;
}

/** A command of the plan that failed, or could not be started at all (SDD-22). */
export const FUD0451 = (p: FUD0451Params): ProjectDiagnostic =>
  project(
    'FUD0451',
    'error',
    p.status === null
      ? `could not run \`${p.line}\`: is it installed and on your PATH?`
      : `\`${p.line}\` exited with code ${p.status}`,
  );
