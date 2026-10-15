import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1023`. */
export type FUD1023Params = FileInput & {
  /** Why it could not be read: the JSON error, or the part of the shape that is wrong. */
  readonly reason: string;
};

/** A catalog that is not JSON or does not have the shape of a `Catalog` (SDD-58). */
export const FUD1023 = (p: FUD1023Params): FileDiagnostic =>
  file('FUD1023', 'error', `this translation catalog cannot be read: ${p.reason}`, p);
