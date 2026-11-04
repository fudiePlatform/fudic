import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1220`; `span` is the line, `file` the `.fudlog` when known. */
export interface FUD1220Params extends SourceInput {
  /** What in the line could not be read. */
  readonly reason: string;
}

/** A line of a `.fudlog` does not follow the history format; it is skipped (SDD-65). */
export const FUD1220 = (p: FUD1220Params): SourceDiagnostic =>
  source('FUD1220', 'warning', `a history line cannot be read: ${p.reason}`, p);
