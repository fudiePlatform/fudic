import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `@render` argument that reads the scope without `@` (SDD-48). */
export const FUD0894 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0894',
    'error',
    'an argument that reads the scope is written with `@`, as a prop is: `@name`, `@a.b` or `@( … )`; only a literal goes bare',
    p,
  );
