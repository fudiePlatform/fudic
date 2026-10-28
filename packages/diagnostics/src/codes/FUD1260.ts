import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1260`. */
export type FUD1260Params = SourceInput & {
  /** The rule as written under the argument. */
  readonly rule: string;
};

/** A rule under a function's argument that is not one of the built-ins of `@fudic/forms` (SDD-67). */
export const FUD1260 = (p: FUD1260Params): SourceDiagnostic =>
  source(
    'FUD1260',
    'error',
    `rule \`${p.rule}\` cannot check an argument: only required, min, max, min-length, max-length and pattern can`,
    p,
  );
