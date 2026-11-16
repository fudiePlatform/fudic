import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1553`. */
export interface FUD1553Params extends FileInput {
  readonly pattern: string;
}

/** A rule of `assets.headers` that matches no file of the build (SDD-84). */
export const FUD1553 = (p: FUD1553Params): FileDiagnostic =>
  file('FUD1553', 'hint', `${p.pattern} matches no file of the build`, p);
