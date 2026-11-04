import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD1404`. */
export interface FUD1404Params {
  /** The folder the MCP server was started in. */
  readonly folder: string;
}

/** A tool that needs a fudic project, in a folder without one (SDD-77). */
export const FUD1404 = (p: FUD1404Params): ProjectDiagnostic =>
  project('FUD1404', 'error', `${p.folder} is not a fudic project: there is no fudic.json in it or above it`);
