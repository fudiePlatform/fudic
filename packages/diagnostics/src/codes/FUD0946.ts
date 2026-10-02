import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A workspace term module that does not export `selfTest` (SDD-52). */
export const FUD0946 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0946', 'error', 'a workspace term must export selfTest', p);
