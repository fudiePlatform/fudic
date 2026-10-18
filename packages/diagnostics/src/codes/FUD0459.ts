import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0459`; `file` is the snippet file. */
export type FUD0459Params = FileInput & {
  /** `taken`: it already declares that snippet. `not-snippets`: it is a component, a page… */
  readonly reason: 'taken' | 'not-snippets';
  readonly name: string;
};

/** `fudic g snippet` into a file that cannot take it (BUG-50). */
export const FUD0459 = (p: FUD0459Params): FileDiagnostic =>
  file(
    'FUD0459',
    'error',
    p.reason === 'taken'
      ? `"${p.file}" already declares the snippet "${p.name}": give the new one another name`
      : `"${p.file}" is not a snippet file: snippets go in a file of their own, with no host and no doctype`,
    p,
  );
