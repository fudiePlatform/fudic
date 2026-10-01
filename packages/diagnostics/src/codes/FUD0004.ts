import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A JavaScript template literal with no closing backtick (SDD-02). */
export const FUD0004 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0004', 'error', 'Unterminated template literal', p);
