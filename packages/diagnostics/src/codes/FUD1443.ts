import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1443`; `file` is the `fudic.json` that declares the guide. */
export interface FUD1443Params extends FileInput {
  /** The path `guide.icon` gives. */
  readonly icon: string;
}

/** `guide.icon` names a file that does not exist (SDD-79). */
export const FUD1443 = (p: FUD1443Params): FileDiagnostic =>
  file('FUD1443', 'error', `${p.file}: the guide's icon "${p.icon}" does not exist`, p);
