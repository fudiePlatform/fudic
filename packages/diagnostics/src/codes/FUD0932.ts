import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A term line with no block above it (`.fudspec`). */
export const FUD0932 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0932', 'error', 'a term goes inside a `given`, `when` or `then` block', p);
