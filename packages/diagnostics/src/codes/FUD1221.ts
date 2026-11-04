import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1221`; `file` is what the command was given. */
export type FUD1221Params = FileInput;

/** `approve`, `accept` or `history` was given something that is not a component or a route (SDD-65). */
export const FUD1221 = (p: FUD1221Params): FileDiagnostic =>
  file('FUD1221', 'error', `${p.file} is not a component or a route`, p);
