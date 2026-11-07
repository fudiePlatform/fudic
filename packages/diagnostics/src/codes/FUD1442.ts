import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1442`; `file` is the guide's sheet and `span` its `@import`. */
export interface FUD1442Params extends SourceInput {
  /** The basename of the imported file, without `.css`. */
  readonly name: string;
  /** The source of the pattern a sheet name has to match. */
  readonly pattern: string;
}

/** An adoptable import of the guide whose file name is not a sheet name (SDD-79). */
export const FUD1442 = (p: FUD1442Params): SourceDiagnostic =>
  source(
    'FUD1442',
    'error',
    `"${p.name}" cannot be adopted by name: a piece of the guide is named after its file, which must ` +
      `match ${p.pattern} (no hyphen: the hyphen is what makes a tag)`,
    p,
  );
