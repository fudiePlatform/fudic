import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0740`; `file` is the `fudic.json` that declares the sheet. */
export type FUD0740Params = FileInput & {
  /** The sheet name. */
  readonly name: string;
  /** The path the entry gives. */
  readonly entry: string;
} & (
    | { readonly problem: 'missing' }
    | {
        readonly problem: 'unreadable';
        /** Why the read failed. */
        readonly reason: string;
      }
  );

/** A `globalStyles`/`styles` entry naming a file that does not exist or cannot be read (SDD-42). */
export const FUD0740 = (p: FUD0740Params): FileDiagnostic =>
  file(
    'FUD0740',
    'error',
    p.problem === 'missing'
      ? `${p.file}: "${p.name}": "${p.entry}" does not exist.`
      : `${p.file}: "${p.name}": "${p.entry}" could not be read: ${p.reason}`,
    p,
  );
