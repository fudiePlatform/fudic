import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Which clause is wrong. */
export type FUD1075Problem = 'status' | 'compress';

/** Parameters of `FUD1075`. */
export type FUD1075Params = SourceInput & {
  /** The value as written. */
  readonly text: string;
  readonly problem: FUD1075Problem;
};

const WHY: Readonly<Record<FUD1075Problem, string>> = {
  status: 'a failure status is between 400 and 599',
  compress: 'compress takes `gzip`, `deflate` or `deflate-raw` and an optional minimum size, or `off`',
};

/** A failure status out of range, or a `compress` that names no encoding (SDD-60). */
export const FUD1075 = (p: FUD1075Params): SourceDiagnostic =>
  source('FUD1075', 'error', `\`${p.text}\` is not valid: ${WHY[p.problem]}`, p);
