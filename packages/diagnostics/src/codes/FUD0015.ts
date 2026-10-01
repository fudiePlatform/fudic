import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A quoted attribute value with no closing quote (SDD-03). */
export const FUD0015 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0015', 'error', 'unterminated attribute value', p);
