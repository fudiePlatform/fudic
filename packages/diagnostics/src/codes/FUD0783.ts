import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0783`. */
export interface FUD0783Params {
  /** The library's directory, relative to the working directory. */
  readonly dir: string;
}

/** `fudic g page` aimed at a library, which has no routes (SDD-44). */
export const FUD0783 = (p: FUD0783Params): ProjectDiagnostic =>
  project(
    'FUD0783',
    'error',
    `${p.dir} is a library, and a library has no routes: no base, no URL, and no plugin ` +
      'builds it. A layout can live here; a page cannot.',
  );
