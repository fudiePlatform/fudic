import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0800`; `file` is the library (its name, or its root when it has none). */
export interface FUD0800Params extends FileInput {
  /** The framework package the range is about. */
  readonly compiler: string;
  /** The range the library declares. */
  readonly range: string;
  /** The version this build resolved. */
  readonly version: string;
}

/** A library whose framework peer range excludes the compiler this build resolves (SDD-45). */
export const FUD0800 = (p: FUD0800Params): FileDiagnostic =>
  file(
    'FUD0800',
    'error',
    `the library "${p.file}" was written for ` +
      `${p.compiler} "${p.range}", and this build resolved ${p.version}. A library ` +
      'publishes .fud source, so that compiler is the one parsing it: what a mismatch produces ' +
      'is a syntax error in a file you did not write. Upgrade one of the two, or ask the ' +
      'library to widen its range.',
    p,
  );
