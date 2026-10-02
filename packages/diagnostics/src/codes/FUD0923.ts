import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A second `component` declaration in the same file (`.fudspec`). */
export const FUD0923 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0923', 'error', 'the component is already declared: a `.fudspec` specifies one component', p);
