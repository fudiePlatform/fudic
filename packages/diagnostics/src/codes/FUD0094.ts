import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `ref` whose value is not a single simple identifier (SDD-07). */
export const FUD0094 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0094', 'error', 'ref value must be a single simple identifier, e.g. `ref="@input"`', p);
