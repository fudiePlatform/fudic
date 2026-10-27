import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `new` expression in the view (SDD-61). */
export const FUD1141 = (p: SourceInput): SourceDiagnostic =>
  source('FUD1141', 'error', '`new` does not port: the view reads values, it does not build them', p);
