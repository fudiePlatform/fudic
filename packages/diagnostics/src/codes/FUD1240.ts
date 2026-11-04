import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1240`; `file` is the piece `g api` was given. */
export type FUD1240Params = FileInput;

/** `g api` on something that is neither a route nor a component (SDD-66). */
export const FUD1240 = (p: FUD1240Params): FileDiagnostic =>
  file('FUD1240', 'error', `${p.file} is not a route or a component: only they have a server`, p);
