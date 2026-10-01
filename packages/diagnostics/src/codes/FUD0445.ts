import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** `fudic g component --in <file>` names a file that does not parse; `file` is it (SDD-22). */
export const FUD0445 = (p: FileInput): FileDiagnostic =>
  file('FUD0445', 'error', `--in ${p.file}: the file does not parse; it was left untouched`, p);
