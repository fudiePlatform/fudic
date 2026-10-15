import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1024`. */
export type FUD1024Params = SourceInput & {
  /** The locale of the bad translation. */
  readonly locale: string;
  /** What is wrong: the ICU error, or the holes and tags that do not match. */
  readonly reason: string;
};

/** A translation with invalid ICU, or with holes or tags other than the original's (SDD-58). */
export const FUD1024 = (p: FUD1024Params): SourceDiagnostic =>
  source('FUD1024', 'error', `the "${p.locale}" translation of this message is invalid: ${p.reason}`, p);
