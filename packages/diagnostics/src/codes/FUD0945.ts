import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A term module that does not export `run` (SDD-52). */
export const FUD0945 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0945', 'error', 'the term module does not export run', p);
