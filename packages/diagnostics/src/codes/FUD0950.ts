import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0950`. */
export interface FUD0950Params extends SourceInput {
  /** The fixture line: `props`, `data`, `answers`, `services`. */
  readonly line: string;
  readonly fixture: string;
  /** Every name the fixture file has for that line. */
  readonly available: readonly string[];
}

/** A fixture line names a key the fixture file does not have (SDD-52, SDD-82). */
export const FUD0950 = (p: FUD0950Params): SourceDiagnostic =>
  source('FUD0950', 'error', `the fixture has no ${p.line} "${p.fixture}"; it has: [${p.available.join(', ')}]`, p);
