import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0856`. */
export interface FUD0856Params extends SourceInput {
  /** The URL as written in the `@import`. */
  readonly url: string;
}

/** An `@import` that closes a cycle of imports (SDD-49). */
export const FUD0856 = (p: FUD0856Params): SourceDiagnostic =>
  source('FUD0856', 'error', `this @import closes a cycle (${p.url}): it is dropped`, p);
