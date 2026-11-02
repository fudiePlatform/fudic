import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1383`. */
export interface FUD1383Params extends SourceInput {
  /** The name after the `$`. */
  readonly name: string;
}

/** A handler reads a delegated row as `$name`, the retired form (SDD-72). */
export const FUD1383 = (p: FUD1383Params): SourceDiagnostic =>
  source(
    'FUD1383',
    'error',
    `a delegated row is read by its name: write \`${p.name}\`, not \`$${p.name}\``,
    p,
  );
