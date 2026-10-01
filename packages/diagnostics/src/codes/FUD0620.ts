import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0620`. */
export interface FUD0620Params {
  /** The route pattern. */
  readonly pattern: string;
  /** The message of what the render threw. */
  readonly reason: string;
}

/** A route whose prerender threw: the build fails (SDD-39). */
export const FUD0620 = (p: FUD0620Params): ProjectDiagnostic =>
  project('FUD0620', 'error', `${p.pattern} failed to prerender: ${p.reason}`);
