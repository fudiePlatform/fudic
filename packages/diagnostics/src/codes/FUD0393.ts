import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** A `strategy()` argument that is not an object literal of literal values (SDD-20). */
export const FUD0393 = (p: FileInput): FileDiagnostic =>
  file(
    'FUD0393',
    'warning',
    'strategy() needs an object literal with literal values (it is read statically, never run)',
    p,
  );
