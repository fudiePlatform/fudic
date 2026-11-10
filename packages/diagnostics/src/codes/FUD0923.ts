import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A second header in the same file (`.fudspec`) (SDD-52, SDD-82). */
export const FUD0923 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0923', 'error', 'the header is already written: a `.fudspec` has one `component`, `page` or `flow`', p);
