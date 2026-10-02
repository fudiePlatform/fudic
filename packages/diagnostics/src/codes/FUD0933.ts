import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0933`. */
export interface FUD0933Params extends SourceInput {
  /** The slug of the criterion. */
  readonly slug: string;
}

/** A criterion with no `then` block (`.fudspec`). */
export const FUD0933 = (p: FUD0933Params): SourceDiagnostic =>
  source('FUD0933', 'error', `criterion \`${p.slug}\` has no \`then\`: a criterion without an outcome checks nothing`, p);
