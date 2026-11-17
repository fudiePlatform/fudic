import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1570`. */
export type FUD1570Params = FileInput & {
  /** Each library of the chain with `src/_error.fud`: its package and its file. */
  readonly libraries: readonly { readonly package: string; readonly file: string }[];
};

/** An app without its own `_error.fud` whose chain has two libraries that offer one (SDD-87). */
export const FUD1570 = (p: FUD1570Params): FileDiagnostic =>
  file(
    'FUD1570',
    'error',
    `Two or more libraries of the chain offer an error page (${p.libraries.map((l) => `${l.package} at ${l.file}`).join(', ')}): write the app's own with \`fudic g error-page\``,
    p,
  );
