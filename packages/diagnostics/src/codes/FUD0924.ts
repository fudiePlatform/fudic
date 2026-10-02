import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `component` declaration after the first criterion (`.fudspec`). */
export const FUD0924 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0924', 'error', '`component` goes before the first `criterion`', p);
