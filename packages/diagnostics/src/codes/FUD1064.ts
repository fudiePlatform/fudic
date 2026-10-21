import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1064`. */
export type FUD1064Params = SourceInput & {
  /** The text left over. */
  readonly text: string;
};

/** Text after everything a `.fudapi` line can hold (SDD-60). */
export const FUD1064 = (p: FUD1064Params): SourceDiagnostic =>
  source('FUD1064', 'error', `unexpected \`${p.text}\` at the end of the line`, p);
