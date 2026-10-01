import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0366`. */
export interface FUD0366Params {
  /** The URL the public file is served under. */
  readonly url: string;
}

/** A public file reached by a relative path instead of its URL (BUG-40). */
export const FUD0366 = (p: FUD0366Params): ProjectDiagnostic =>
  project(
    'FUD0366',
    'error',
    'A public file is named by its URL, not by a path into the public directory: ' +
      `write "${p.url}". Reaching it with a relative path publishes a second, hashed copy of a file ` +
      'that is already served under its own name.',
  );
