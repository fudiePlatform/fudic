import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** `export const http` that is not a `chain()…`, or that ends in `.handle` (SDD-56). */
export const FUD1004 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD1004',
    'error',
    '`http` is the chain of this file: write it as `chain()` with `.use`, `.skip` and `.compress`, and no `.handle`',
    p,
  );
