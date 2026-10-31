import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** What follows `@await` is not a `later` field of `data` (SDD-70). */
export const FUD1320 = (p: SourceInput): SourceDiagnostic =>
  source('FUD1320', 'error', '`@await` takes a `later` field of `data`: `@await data.<field>`', p);
