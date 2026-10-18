import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0458`. */
export interface FUD0458Params {
  /** What was wrong: the snippet's name, or the name of the file it goes in. */
  readonly what: 'snippet' | 'file';
  readonly name: string;
}

/** `fudic g snippet` with a name that is not a snippet name, or a file name that makes no file (BUG-50). */
export const FUD0458 = (p: FUD0458Params): ProjectDiagnostic =>
  project(
    'FUD0458',
    'error',
    p.what === 'snippet'
      ? `invalid snippet name "${p.name}": letters, digits and "_", starting with a letter, e.g. "productCard"`
      : `invalid snippet file "${p.name}": kebab-case, starting with a letter, e.g. "ui" or "form-fields"`,
  );
