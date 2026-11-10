import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0952`. */
export interface FUD0952Params extends SourceInput {
  /** The fixture line: `props`, `data`, `answers`, `services`, `path`, `url`. */
  readonly line: string;
}

/** A fixture line outside `given`, or a second one in the criterion (SDD-52, SDD-82). */
export const FUD0952 = (p: FUD0952Params): SourceDiagnostic =>
  source('FUD0952', 'error', `${p.line} goes in given, at most once per criterion`, p);
