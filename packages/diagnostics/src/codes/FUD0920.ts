import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A string opened with `"` that does not close on its line (`.fudspec`). */
export const FUD0920 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0920', 'error', 'a string opened with `"` is not closed on its line', p);
