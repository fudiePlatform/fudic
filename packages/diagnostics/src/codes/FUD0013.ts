import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `<` that does not open a well-formed tag (SDD-03). */
export const FUD0013 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0013', 'error', 'malformed tag', p);
