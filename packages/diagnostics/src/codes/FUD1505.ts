import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1505`. */
export interface FUD1505Params extends SourceInput {
  readonly url: string;
}

/** `url` or `go` in a flow with a URL no route matches (`.fudspec`) (SDD-82). */
export const FUD1505 = (p: FUD1505Params): SourceDiagnostic =>
  source('FUD1505', 'warning', `no route matches ${p.url}`, p);
