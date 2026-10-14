import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0975`. */
export interface FUD0975Params {
  /** The browsers tried, in order. */
  readonly tried: readonly string[];
  /** What Playwright said when the last one failed. */
  readonly reason: string;
  /** The command that installs the one Playwright can download. */
  readonly install: string;
}

/** No browser could be launched to run the criteria (SDD-32, BUG-48). */
export const FUD0975 = (p: FUD0975Params): ProjectDiagnostic =>
  project(
    'FUD0975',
    'error',
    `could not launch a browser to run the criteria: tried ${p.tried.join(', ')} (${p.reason}). Install one, or run \`${p.install}\``,
  );
