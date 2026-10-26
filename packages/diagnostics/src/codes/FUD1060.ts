import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1060`. */
export type FUD1060Params = SourceInput;

/** A string of a `.fudapi` line that its line never closes (SDD-60). */
export const FUD1060 = (p: FUD1060Params): SourceDiagnostic =>
  source('FUD1060', 'error', 'unclosed string: a string opens and closes on the same line', p);
