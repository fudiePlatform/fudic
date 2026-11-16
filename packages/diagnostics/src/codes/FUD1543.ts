import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1543`. */
export interface FUD1543Params extends FileInput {
  readonly name: string;
  /** The value, or the part of it, that is wrong; `''` for an empty value. */
  readonly value: string;
  /** What the header accepts, in a few words: `same-origin, same-origin-allow-popups, …`. */
  readonly expected: string;
}

/** A value the header does not accept, or an empty one outside `assets.headers` (SDD-84). */
export const FUD1543 = (p: FUD1543Params): FileDiagnostic =>
  file(
    'FUD1543',
    'error',
    p.value === ''
      ? `${p.name} has no value: remove the line to not send it`
      : `${p.name} does not accept "${p.value}": expected ${p.expected}`,
    p,
  );
