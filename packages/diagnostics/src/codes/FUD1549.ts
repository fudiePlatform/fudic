import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1549`. */
export interface FUD1549Params extends FileInput {
  readonly value: string;
}

/** A referrer policy that does not send the path within the origin (SDD-84). */
export const FUD1549 = (p: FUD1549Params): FileDiagnostic =>
  file(
    'FUD1549',
    'warning',
    `Referrer-Policy ${p.value} does not send the path within the origin, so back has nowhere to return`,
    p,
  );
