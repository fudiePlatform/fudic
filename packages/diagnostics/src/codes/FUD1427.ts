import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** `fudic_record { event: "look" }` without a `fudic_look` over the files as they are (SDD-78). */
export const FUD1427 = (p: FileInput): FileDiagnostic =>
  file('FUD1427', 'error', `the look of ${p.file} as it is now was never shown: run fudic_look first`, p);
