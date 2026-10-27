import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A type the view or the server cut reads that does not exist in every backend (SDD-61). */
export const FUD1153 = (p: SourceInput): SourceDiagnostic =>
  source('FUD1153', 'error', 'this type does not port: declare it in the `.fudapi`', p);
