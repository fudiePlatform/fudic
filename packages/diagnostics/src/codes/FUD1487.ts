import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1487`. */
export type FUD1487Params = SourceInput & {
  /** The size as written: `2mo`. */
  readonly text: string;
};

/** A size with a unit that is not `kb`, `mb` or `gb` (SDD-81). */
export const FUD1487 = (p: FUD1487Params): SourceDiagnostic =>
  source(
    'FUD1487',
    'error',
    `\`${p.text}\` is a size with an unknown unit: write a number of bytes, or one followed by \`kb\`, \`mb\` or \`gb\``,
    p,
  );
