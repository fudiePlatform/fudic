import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A JavaScript block comment with no closing marker (SDD-02). */
export const FUD0005 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0005', 'error', 'Unterminated block comment', p);
