import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1402`; `file` is the file the edits were for. */
export interface FUD1402Params extends FileInput {
  /** The text the edit looked for. */
  readonly old: string;
  /** How many times it is in the file: 0, or more than 1. */
  readonly found: number;
}

/** An edit of `fudic_write` whose text is not in the file exactly once (SDD-77). */
export const FUD1402 = (p: FUD1402Params): FileDiagnostic =>
  file(
    'FUD1402',
    'error',
    p.found === 0
      ? `${p.file} does not contain ${JSON.stringify(p.old)}: nothing was written`
      : `${p.file} contains ${JSON.stringify(p.old)} ${p.found} times: nothing was written`,
    p,
  );
