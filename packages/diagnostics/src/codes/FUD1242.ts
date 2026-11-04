import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1242`; `file` is the project or library whose components were looked at. */
export type FUD1242Params = FileInput;

/** `g showcase` found no component with a fixture (SDD-66). */
export const FUD1242 = (p: FUD1242Params): FileDiagnostic =>
  file('FUD1242', 'error', `${p.file} has no component with a fixture: nothing to show`, p);
