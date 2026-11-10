import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1508`. */
export type FUD1508Params = FileInput & {
  /** The time it waited, in milliseconds. */
  readonly ms: number;
  /** What was still pending, one entry each: `fetch /api/search`, `2 timers`, `a frame`. */
  readonly pending: readonly string[];
};

/** The workbench: the page did not settle before a `then` (SDD-82). */
export const FUD1508 = (p: FUD1508Params): FileDiagnostic =>
  file('FUD1508', 'error', `the page did not settle in ${p.ms} ms; still pending: ${p.pending.join(', ')}`, p);
