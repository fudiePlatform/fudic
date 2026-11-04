import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1204`; `file` is the `.fudspec`, `span` the step. */
export interface FUD1204Params extends FileInput {
  /** The term that threw. */
  readonly term: string;
  /** The message of what it threw. */
  readonly reason: string;
}

/** A step's term threw, for a reason that is none of the known ones (SDD-64). */
export const FUD1204 = (p: FUD1204Params): FileDiagnostic =>
  file('FUD1204', 'error', `term "${p.term}" threw: ${p.reason}`, p);
