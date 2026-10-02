import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A property binding that writes unescaped HTML (SDD-51). */
export const FUD0916 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0916',
    'error',
    'this property writes HTML without escaping it',
    p,
  );
