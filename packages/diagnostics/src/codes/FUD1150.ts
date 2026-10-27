import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A declaration the view reads that the server cannot evaluate in every backend (SDD-61). */
export const FUD1150 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD1150',
    'error',
    'the view reads this, but the server cannot evaluate it: use `signal`, `computed` or a `const` of the portable view',
    p,
  );
