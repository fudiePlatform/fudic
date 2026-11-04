import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1241`; `file` is the library piece `g api` was given. */
export type FUD1241Params = FileInput;

/** `g api` on a piece of a library (SDD-66). */
export const FUD1241 = (p: FUD1241Params): FileDiagnostic =>
  file('FUD1241', 'error', `${p.file} belongs to a library: its server is not generated yet`, p);
