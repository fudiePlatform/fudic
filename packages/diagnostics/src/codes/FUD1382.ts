import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1382`. */
export interface FUD1382Params extends SourceInput {
  /** The delegated row's name, as the handler writes it. */
  readonly name: string;
}

/** A delegated row whose name is also in scope where the handler is written (SDD-72). */
export const FUD1382 = (p: FUD1382Params): SourceDiagnostic =>
  source(
    'FUD1382',
    'error',
    `\`${p.name}\` is both the delegated row and a name in scope here: rename the loop binding or the variable`,
    p,
  );
