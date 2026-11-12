import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1528`. */
export interface FUD1528Params extends FileInput {
  /** The id of `allow` nothing uses. */
  readonly id: string;
}

/** A feature allowed in `baseline.allow` that nothing of the project uses (SDD-83). */
export const FUD1528 = (p: FUD1528Params): FileDiagnostic =>
  file('FUD1528', 'hint', `"${p.id}" in "allow" is not used by anything in this project`, p);
