import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** `fudic g component --in <file>` names a file that does not exist; `file` is it (SDD-22). */
export const FUD0444 = (p: FileInput): FileDiagnostic =>
  file('FUD0444', 'error', `--in ${p.file}: no such file`, p);
