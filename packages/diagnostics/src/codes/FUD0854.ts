import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** An `@import` in a `globalStyles` or `styles` sheet, which is adopted and drops it (SDD-49). */
export const FUD0854 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0854',
    'error',
    'a sheet of globalStyles or styles is adopted, and an adopted sheet does not take @import: it is dropped. Import it from a stylesheet a layout links, or list the file in fudic.json',
    p,
  );
