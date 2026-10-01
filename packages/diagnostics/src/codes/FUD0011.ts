import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A Razor comment `@* … *@` with no closing `*@` (SDD-03). */
export const FUD0011 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0011', 'error', 'unterminated Razor comment', p);
