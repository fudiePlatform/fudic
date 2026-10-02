import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A block written before any criterion (`.fudspec`). */
export const FUD0931 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0931', 'error', 'a `given`, `when` or `then` block goes inside a `criterion`', p);
