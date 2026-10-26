import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1077`. */
export type FUD1077Params = SourceInput & {
  /** What the JS regex engine said. */
  readonly reason: string;
};

/** A `pattern` whose regex does not compile (SDD-60). */
export const FUD1077 = (p: FUD1077Params): SourceDiagnostic =>
  source('FUD1077', 'error', `this pattern is not a valid regex: ${p.reason}`, p);
