import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A stack trace written into the view (SDD-51, SDD-61). */
export const FUD0917 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0917', 'error', 'this puts server internals into the HTML: a stack trace', p);
