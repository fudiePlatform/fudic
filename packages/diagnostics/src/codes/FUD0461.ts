import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0461`. */
export interface FUD0461Params extends SourceInput {
  /** The `$`-prefixed identifier. */
  readonly name: string;
}

/** A user identifier starting with `$`, the namespace reserved to the compiler (SDD-24). */
export const FUD0461 = (p: FUD0461Params): SourceDiagnostic =>
  source(
    'FUD0461',
    'error',
    `"${p.name}" is reserved: identifiers starting with $ belong to the compiler`,
    p,
  );
