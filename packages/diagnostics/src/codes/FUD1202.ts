import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1202`; `file` is the `.fudspec`, `span` the step. */
export interface FUD1202Params extends FileInput {
  /** The term that did not finish. */
  readonly term: string;
  /** What the browser said when it gave up. */
  readonly reason: string;
}

/** A step's term did not finish in its time (SDD-64). */
export const FUD1202 = (p: FUD1202Params): FileDiagnostic =>
  file('FUD1202', 'error', `term "${p.term}" ran out of time: ${p.reason}`, p);
