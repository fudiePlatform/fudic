import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1220`; `file` is the `.fudlog`, `span` the line. */
export interface FUD1220Params extends FileInput {
  /** What in the line could not be read. */
  readonly reason: string;
}

/** A line of a `.fudlog` does not follow the history format; it is skipped (SDD-65). */
export const FUD1220 = (p: FUD1220Params): FileDiagnostic =>
  file('FUD1220', 'warning', `a history line cannot be read: ${p.reason}`, p);
