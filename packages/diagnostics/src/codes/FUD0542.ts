import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `key (…)` clause on a construct that is not a loop (SDD-30). */
export const FUD0542 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0542', 'error', "'key (…)' is only valid on a loop", p);
