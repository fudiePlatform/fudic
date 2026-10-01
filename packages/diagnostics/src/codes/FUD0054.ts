import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A CDATA section outside SVG or MathML content (SDD-05). */
export const FUD0054 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0054', 'error', 'CDATA section outside SVG or MathML content', p);
