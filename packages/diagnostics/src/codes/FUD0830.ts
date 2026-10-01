import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0830`. */
export interface FUD0830Params extends SourceInput {
  /** The argument name written. */
  readonly arg: string;
  /** The snippet the call names. */
  readonly name: string;
}

/** A named `@render` argument that matches no parameter (SDD-29). */
export const FUD0830 = (p: FUD0830Params): SourceDiagnostic =>
  source('FUD0830', 'error', `"${p.arg}" is not a parameter of @snippet ${p.name}`, p);
