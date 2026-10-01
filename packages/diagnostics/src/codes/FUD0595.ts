import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `control` binding with no `<form control="…">` above it (SDD-34). */
export const FUD0595 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0595',
    'error',
    '`control` needs a `<form control="…">` above it: a node binds inside its own form, and a component that binds one it received must mark its template `formassociated`',
    p,
  );
