import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `shadowrootreferencetarget` that is dynamic or names no element of the template (BUG-42). */
export const FUD0605 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0605',
    'error',
    '`shadowrootreferencetarget` must be a static id of an element of this template: the bridge points at an element the compiler can see',
    p,
  );
