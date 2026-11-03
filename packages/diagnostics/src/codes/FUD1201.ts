import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1201`; `file` is the `.fudspec`, `span` the step. */
export interface FUD1201Params extends FileInput {
  /** The term as the step names it. */
  readonly term: string;
}

/** A step names a term that neither `@fudic/terms` nor the project's `fudic/terms/` has (SDD-64). */
export const FUD1201 = (p: FUD1201Params): FileDiagnostic =>
  file('FUD1201', 'error', `there is no term "${p.term}"`, p);
