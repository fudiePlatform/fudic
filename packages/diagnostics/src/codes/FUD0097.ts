import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `bus:` binding with no event name after the prefix (SDD-07). */
export const FUD0097 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0097', 'error', 'bus binding has no event name after `bus:`', p);
