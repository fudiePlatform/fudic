import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `file` field of a `form` with an initial value (SDD-81). */
export const FUD1482 = (p: SourceInput): SourceDiagnostic =>
  source('FUD1482', 'error', 'a file field has no initial value: it starts empty (`null`, or `[]` for `file[]`)', p);
