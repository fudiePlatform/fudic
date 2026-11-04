import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1407`; `file` is the piece. */
export interface FUD1407Params extends FileInput {
  /** The first phase the piece has not finished. */
  readonly phase: string;
}

/** `fudic_record { event: "done" }` on a piece with a phase still to finish (SDD-77). */
export const FUD1407 = (p: FUD1407Params): FileDiagnostic =>
  file('FUD1407', 'error', `${p.file} is not done: its ${p.phase} phase is not finished`, p);
