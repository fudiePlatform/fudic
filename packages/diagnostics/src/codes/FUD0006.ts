import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A JavaScript regular expression literal with no closing slash (SDD-02). */
export const FUD0006 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0006', 'error', 'Unterminated regular expression literal', p);
