import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD1423`. */
export interface FUD1423Params {
  /** The function: `routes/products.save`. */
  readonly fn: string;
}

/** A function of a `.fudapi` called while its handler is still missing (SDD-78). */
export const FUD1423 = (p: FUD1423Params): ProjectDiagnostic =>
  project('FUD1423', 'error', `${p.fn} has no handler yet`);
