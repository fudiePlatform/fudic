import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `bus:` binding whose value is not exactly one `@` handler (SDD-07). */
export const FUD0096 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0096', 'error', 'bus binding value must be exactly one `@` handler', p);
