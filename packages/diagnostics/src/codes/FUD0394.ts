import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** A page that calls `strategy()` more than once (SDD-20). */
export const FUD0394 = (p: FileInput): FileDiagnostic =>
  file('FUD0394', 'warning', 'A page may call strategy() only once; the first call wins', p);
