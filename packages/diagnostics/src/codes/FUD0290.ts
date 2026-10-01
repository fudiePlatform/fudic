import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0290`. */
export interface FUD0290Params extends SourceInput {
  /** The author's identifier that starts with `$`. */
  readonly name: string;
}

/** A user identifier with the `$` prefix, reserved for what the compiler emits (SDD-15). */
export const FUD0290 = (p: FUD0290Params): SourceDiagnostic =>
  source(
    'FUD0290',
    'error',
    `"${p.name}" is reserved: the $ prefix belongs to the identifiers the compiler emits into this scope. Rename it — a trailing $ ("${p.name.slice(1)}$") is yours.`,
    p,
  );
