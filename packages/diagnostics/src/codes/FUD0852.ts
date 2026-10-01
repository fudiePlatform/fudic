import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/**
 * Parameters of `FUD0852`. The place is where the sheet is brought in — its `<link>`, the
 * `@import` that names it, or `fudic.json` — because that is the line that goes.
 */
export interface FUD0852Params extends FileInput {
  /** The sheet, as the author knows it: its path from the project, or its `fudic.json` entry. */
  readonly sheet: string;
}

/** A sheet (or a file it imports) that adds no rule to any page of the application (SDD-49). */
export const FUD0852 = (p: FUD0852Params): FileDiagnostic =>
  file(
    'FUD0852',
    'warning',
    `${p.sheet} adds no rule to any page of the application: ` +
      'nothing any page renders matches it. It is dead CSS, and what brings it in here can go.',
    p,
  );
