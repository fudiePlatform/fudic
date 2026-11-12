import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1502`. */
export interface FUD1502Params extends SourceInput {
  readonly value: string;
  /** Every value the fixture's `paths` lists. */
  readonly paths: readonly string[];
}

/** `path <value>` with a value the fixture's `paths` does not list (`.fudspec`) (SDD-82). */
export const FUD1502 = (p: FUD1502Params): SourceDiagnostic =>
  source('FUD1502', 'error', `"${p.value}" is not in the fixture's paths: [${p.paths.join(', ')}]`, p);
