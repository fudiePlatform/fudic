import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** A sheet (or a file it imports) that adds no rule to any page of the application (SDD-49). */
export const FUD0852 = (p: FileInput): FileDiagnostic =>
  file(
    'FUD0852',
    'warning',
    `${p.file} adds no rule to any page of the application: ` +
      'nothing any page renders matches it. It is dead CSS — if a sheet imports it, that @import can go.',
    p,
  );
