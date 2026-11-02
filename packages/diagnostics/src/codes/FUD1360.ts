import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** `fails` under `load`: what a `load` fails with goes to `error-pages` (SDD-74, decision 175). */
export const FUD1360 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD1360',
    'error',
    '`fails` does not belong to `load`: a page whose data fails goes to error-pages. Throw an error of @fudic/http from its handler: notFound(), forbidden().',
    p,
  );
