import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** An unquoted attribute value written as a JSX expression, `{…}` (SDD-62). */
export const FUD1161 = (p: SourceInput): SourceDiagnostic =>
  source('FUD1161', 'error', 'a `{…}` value is JSX: bind it with `@`', p);
