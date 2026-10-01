import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0666`. */
export interface FUD0666Params extends SourceInput {
  /** The identifier as written, with its `$`. */
  readonly name: string;
}

/** A `$name` read outside the argument list of an event binding (SDD-37). */
export const FUD0666 = (p: FUD0666Params): SourceDiagnostic =>
  source(
    'FUD0666',
    'error',
    `\`${p.name}\` is only readable in the argument list of an event binding`,
    p,
  );
