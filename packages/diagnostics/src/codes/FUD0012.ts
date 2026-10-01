import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** An HTML comment `<!-- … -->` with no closing `-->` (SDD-03). */
export const FUD0012 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0012', 'error', 'unterminated HTML comment', p);
