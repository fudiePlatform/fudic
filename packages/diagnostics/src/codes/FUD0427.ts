import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `@section` outside a route (SDD-21). */
export const FUD0427 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0427', 'error', '@section is only valid in a route', p);
