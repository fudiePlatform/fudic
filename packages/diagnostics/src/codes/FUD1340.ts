import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1340`. */
export type FUD1340Params = SourceInput & {
  /** The pipe's name, as written. */
  readonly name: string;
};

/** A `pipe` of a `.fudapi` without `on` (SDD-71). Spans the pipe's name. */
export const FUD1340 = (p: FUD1340Params): SourceDiagnostic =>
  source('FUD1340', 'error', `a pipe declares what it formats: \`on <type>\` under \`pipe ${p.name}\``, p);
