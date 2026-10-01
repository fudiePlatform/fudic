import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A control keyword not followed by its `( … )` header (SDD-06). */
export const FUD0070 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0070', 'error', "expected '(' after the control keyword", p);
