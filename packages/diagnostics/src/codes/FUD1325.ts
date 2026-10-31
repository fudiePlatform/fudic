import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** `buffer` on the `load` line without a whole number of bytes behind it (SDD-70 §3.9). */
export const FUD1325 = (p: SourceInput): SourceDiagnostic =>
  source('FUD1325', 'error', '`buffer` needs a whole number of bytes', p);
