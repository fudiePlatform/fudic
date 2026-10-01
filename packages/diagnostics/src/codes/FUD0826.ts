import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0826`. */
export interface FUD0826Params extends SourceInput {
  /** The snippet the call names. */
  readonly name: string;
  /** The namespace of `@render ns.name`; absent for a plain `@render name`. */
  readonly namespace?: string;
}

/** A `@render` whose snippet is in no scope (SDD-29). */
export const FUD0826 = (p: FUD0826Params): SourceDiagnostic =>
  source(
    'FUD0826',
    'error',
    p.namespace === undefined
      ? `no snippet called "${p.name}" is in scope: declare it here, or import the file that does with <link rel="snippet">`
      : `"${p.namespace}" declares no snippet called "${p.name}"`,
    p,
  );
