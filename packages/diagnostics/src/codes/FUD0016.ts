import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A CDATA section `<![CDATA[ … ]]>` with no closing `]]>` (SDD-03). */
export const FUD0016 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0016', 'error', 'unterminated CDATA section', p);
