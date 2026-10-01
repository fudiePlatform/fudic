import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0828`. */
export interface FUD0828Params extends SourceInput {
  /** The snippet the call names. */
  readonly name: string;
  /** The parameter left uncovered; empty when it has no name (a destructured one). */
  readonly param: string;
  /** Its zero-based position in the signature. */
  readonly index: number;
}

/** A `@render` that does not cover a parameter with no default (SDD-29). */
export const FUD0828 = (p: FUD0828Params): SourceDiagnostic =>
  source(
    'FUD0828',
    'error',
    `@render ${p.name} is missing "${p.param === '' ? `argument ${p.index + 1}` : p.param}", which has no default`,
    p,
  );
