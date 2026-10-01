import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A JS/TS fragment the formatter left as written because it does not parse (SDD-26). */
export const FUD0481 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0481', 'info', 'Left this expression unformatted: it does not parse as JavaScript', p);
