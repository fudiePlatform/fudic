import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** An `@` followed by a character that starts no Razor construct (SDD-03). */
export const FUD0010 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0010', 'error', 'character after @ does not start a Razor construct', p);
