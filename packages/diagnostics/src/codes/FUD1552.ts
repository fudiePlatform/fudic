import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1552`. */
export interface FUD1552Params extends FileInput {
  /** The path of the rule. */
  readonly pattern: string;
  /** One file of the build without a hash in its name that the rule covers. */
  readonly path: string;
  /** `immutable`, or the `max-age=N` that is too long. */
  readonly directive: string;
}

/** A long cache on a file whose name does not change when its content does (SDD-84). */
export const FUD1552 = (p: FUD1552Params): FileDiagnostic =>
  file(
    'FUD1552',
    'warning',
    `${p.directive} on ${p.pattern} keeps the old ${p.path} in the browser: its name has no hash`,
    p,
  );
