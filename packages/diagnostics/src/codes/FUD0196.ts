import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A side-effect import in the neutral zone of `@code` (SDD-12). */
export const FUD0196 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0196',
    'warning',
    'side-effect import in the neutral zone; only pure shared modules belong here',
    p,
  );
