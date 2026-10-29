import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1300`; `file` is the route's `.fudapi`, `span` its `load`. */
export interface FUD1300Params extends FileInput {
  /** The route pattern. */
  readonly pattern: string;
}

/** A prerendered page whose `load` or `layout` read the session (SDD-69). */
export const FUD1300 = (p: FUD1300Params): FileDiagnostic =>
  file('FUD1300', 'error', `the prerender of ${p.pattern} reads the session: its HTML would be the same for everyone`, p);
