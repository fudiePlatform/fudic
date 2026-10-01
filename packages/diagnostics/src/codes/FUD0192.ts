import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `ref` binding inside a loop (SDD-12). */
export const FUD0192 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0192', 'error', '`ref` is not allowed inside a loop (@foreach/@for/@while)', p);
