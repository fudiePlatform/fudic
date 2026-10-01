import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `key (…)` clause with no expression inside (SDD-30). */
export const FUD0541 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0541', 'error', "'key (…)' must hold an expression", p);
