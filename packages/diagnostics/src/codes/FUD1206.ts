import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1206`; `file` is `fudic/bench.js`. */
export interface FUD1206Params extends FileInput {
  /** The message of what it threw. */
  readonly reason: string;
}

/** The project's `fudic/bench.js` threw when loaded or in its `setup` (SDD-64). */
export const FUD1206 = (p: FUD1206Params): FileDiagnostic =>
  file('FUD1206', 'error', `the project extension threw: ${p.reason}`, p);
