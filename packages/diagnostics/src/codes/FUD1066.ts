import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1066`. */
export type FUD1066Params = SourceInput;

/** An indented `.fudapi` line with no line above it to belong to (SDD-60). */
export const FUD1066 = (p: FUD1066Params): SourceDiagnostic =>
  source('FUD1066', 'error', 'indented line without a declaration above it', p);
