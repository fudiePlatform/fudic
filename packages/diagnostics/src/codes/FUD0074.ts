import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Content directly inside a `@switch` body that is not a `case`/`default` label (SDD-06). */
export const FUD0074 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0074', 'error', 'only case and default labels may appear directly in a @switch body', p);
