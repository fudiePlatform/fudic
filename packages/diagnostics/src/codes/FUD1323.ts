import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `@catch` that does not follow the body of an `@await`, or a second one (SDD-70). */
export const FUD1323 = (p: SourceInput): SourceDiagnostic =>
  source('FUD1323', 'error', '`@catch` goes right after the body of an `@await`, once', p);
