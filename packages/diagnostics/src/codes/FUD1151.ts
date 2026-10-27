import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A condition or logical operand of the view that is not a `boolean` (SDD-61). */
export const FUD1151 = (p: SourceInput): SourceDiagnostic =>
  source('FUD1151', 'error', 'this is not a `boolean`: the view has no truthiness, compare explicitly', p);
