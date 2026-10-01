import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `delegate:` marker outside any loop (SDD-37). */
export const FUD0663 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0663',
    'error',
    '`delegate:` is only allowed inside a loop (@foreach/@for/@while): outside one there is no row to identify',
    p,
  );
