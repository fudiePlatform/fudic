import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A pop on the parser's background mode: the mode stack underflowed (SDD-01). */
export const FUD0001 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0001', 'error', 'mode stack underflow: pop on the background mode', p);
