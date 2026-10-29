import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** `later` on anything but a field of `load` (SDD-70). */
export const FUD1324 = (p: SourceInput): SourceDiagnostic =>
  source('FUD1324', 'error', '`later` marks a field of `load` only', p);
