import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A criteria file without its header (`.fudspec`) (SDD-52, SDD-82). */
export const FUD0922 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0922', 'error', 'the header is missing: a `.fudspec` starts with `component <tag>`, `page <route>` or `flow <name>`', p);
