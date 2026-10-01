import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0829`. */
export interface FUD0829Params extends SourceInput {
  /** The snippet the call names. */
  readonly name: string;
  /** How many parameters its signature has. */
  readonly count: number;
}

/** A `@render` with more positional arguments than the snippet has parameters (SDD-29). */
export const FUD0829 = (p: FUD0829Params): SourceDiagnostic =>
  source(
    'FUD0829',
    'error',
    `@render ${p.name} takes ${p.count} argument${p.count === 1 ? '' : 's'}`,
    p,
  );
