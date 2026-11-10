import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1488`. */
export type FUD1488Params = FileInput & {
  /** The field as a path: `serve`, `serve.uploads.maxFileSize`, `serve.trustProxy`. */
  readonly field: string;
  /** What it has to be: `an object`, `a size`, `a whole number`, `true or false`, `a known key`. */
  readonly expected: string;
};

/** The `serve` options of `fudic.json` with a wrong shape (SDD-81). */
export const FUD1488 = (p: FUD1488Params): FileDiagnostic =>
  file('FUD1488', 'error', `fudic.json: \`${p.field}\` has to be ${p.expected}`, p);
