import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1222`; `file` is the piece's `.fud`. */
export type FUD1222Params = FileInput;

/** `approve` on a piece with no `.fudspec` (SDD-65). */
export const FUD1222 = (p: FUD1222Params): FileDiagnostic =>
  file('FUD1222', 'error', `${p.file} has no criteria to approve`, p);
