import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** An interpolation of an array or object literal (SDD-12). */
export const FUD0195 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0195',
    'error',
    'interpolation of an array/object literal is not allowed; only scalar primitives',
    p,
  );
