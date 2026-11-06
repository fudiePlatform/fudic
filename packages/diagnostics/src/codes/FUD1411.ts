import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD1411`. */
export interface FUD1411Params {
  /** The command line the tool planned: `fudic g showcase ui`. */
  readonly command: string;
  /** What the CLI said when it stopped. */
  readonly reason: string;
}

/** A plan of the CLI that stopped with an error instead of a diagnostic (SDD-77). */
export const FUD1411 = (p: FUD1411Params): ProjectDiagnostic =>
  project('FUD1411', 'error', `${p.command} stopped: ${p.reason}`);
