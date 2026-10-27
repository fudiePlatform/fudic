import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `case` of `@switch` whose value is not a literal (SDD-61). */
export const FUD1148 = (p: SourceInput): SourceDiagnostic =>
  source('FUD1148', 'error', 'a `case` takes a literal: write the value it matches', p);
