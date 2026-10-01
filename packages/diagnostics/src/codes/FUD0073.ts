import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** An `else` with no `@if` before it (SDD-06). */
export const FUD0073 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0073', 'error', 'else without a matching @if', p);
