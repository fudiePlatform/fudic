import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1420`; `file` is where it threw — the piece when the source has no place. */
export interface FUD1420Params extends FileInput {
  /** The piece as it was asked for: a tag, a URL, a fixture case. */
  readonly piece: string;
  /** What it threw. */
  readonly reason: string;
}

/** `fudic_render` or `fudic_look`: the SSR, a `load` or the hydration threw (SDD-78). */
export const FUD1420 = (p: FUD1420Params): FileDiagnostic =>
  file('FUD1420', 'error', `${p.piece} threw while rendering: ${p.reason}`, p);
