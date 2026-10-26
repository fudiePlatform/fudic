import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** An array pattern or a computed key in a destructuring of the view (SDD-61). */
export const FUD1146 = (p: SourceInput): SourceDiagnostic =>
  source('FUD1146', 'error', 'this pattern does not port: destructure an object by its field names', p);
