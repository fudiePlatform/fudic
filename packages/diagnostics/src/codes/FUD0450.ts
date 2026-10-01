import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** `fudic fmt`: a file that does not parse, left unchanged (SDD-26). */
export const FUD0450 = (p: FileInput): FileDiagnostic =>
  file('FUD0450', 'error', `${p.file} does not parse; left unchanged`, p);
