import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A line indented by something other than 0, 2 or 4 spaces (`.fudspec`). */
export const FUD0921 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0921', 'error', 'indentation must be 0, 2 or 4 spaces', p);
