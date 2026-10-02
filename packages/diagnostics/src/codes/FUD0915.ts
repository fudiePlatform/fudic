import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** An attribute that executes, loads or redirects outside the URL guard (SDD-51). */
export const FUD0915 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0915',
    'error',
    'this attribute runs, loads or redirects to whatever its value says, and the URL guard cannot vouch for it',
    p,
  );
