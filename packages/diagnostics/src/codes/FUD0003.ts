import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A JavaScript string literal with no closing quote (SDD-02). */
export const FUD0003 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0003', 'error', 'Unterminated string literal', p);
