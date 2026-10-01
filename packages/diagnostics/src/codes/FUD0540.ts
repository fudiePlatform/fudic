import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A loop with no `key (…)` clause (SDD-30). */
export const FUD0540 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0540', 'error', "a loop must declare 'key (…)'", p);
