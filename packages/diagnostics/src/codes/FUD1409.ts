import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD1409`. */
export interface FUD1409Params {
  /** The folder the MCP server was started in. */
  readonly folder: string;
}

/** `fudic_new` in a folder that is a fudic project already (SDD-77). */
export const FUD1409 = (p: FUD1409Params): ProjectDiagnostic =>
  project('FUD1409', 'error', `${p.folder} is a fudic project already: nothing was created`);
