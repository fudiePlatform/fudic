import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** An `@empty` that does not follow a loop body, or a second one (SDD-61). */
export const FUD1149 = (p: SourceInput): SourceDiagnostic =>
  source('FUD1149', 'error', '`@empty` goes right after the body of `@foreach`, `@for` or `@while`, once', p);
