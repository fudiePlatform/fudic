import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD1422`. */
export interface FUD1422Params {
  /** The route as it was asked for. */
  readonly url: string;
  /** Concrete URLs that can be opened instead: those of the route's `paths()`. */
  readonly paths: readonly string[];
}

/** A route given as a pattern, or a URL no route matches (SDD-78). */
export const FUD1422 = (p: FUD1422Params): ProjectDiagnostic =>
  project(
    'FUD1422',
    'error',
    p.paths.length === 0
      ? `${p.url} is not a concrete URL of a route`
      : `${p.url} is not a concrete URL of a route; try one of: ${p.paths.join(', ')}`,
  );
