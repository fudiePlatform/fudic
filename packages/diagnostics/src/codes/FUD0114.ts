import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A Razor comment `@* … *@` written inside `@code` (SDD-08, BUG-13). */
export const FUD0114 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0114',
    'error',
    'Razor comments are not allowed inside @code; comment the JavaScript with // or /*…*/',
    p,
  );
