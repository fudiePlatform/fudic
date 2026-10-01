import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** A route default whose pattern matches no discovered route; `file` is that pattern (SDD-19). */
export const FUD0364 = (p: FileInput): FileDiagnostic =>
  file('FUD0364', 'warning', `Route default for "${p.file}" matches no route`, p);
