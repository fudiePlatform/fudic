import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** The `_error.fud` of a project that links no layout (SDD-88). */
export const FUD1581 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD1581',
    'error',
    'the error page links no layout: start it with <link rel="layout" href="…"> (fudic g error-page --force writes one)',
    p,
  );
