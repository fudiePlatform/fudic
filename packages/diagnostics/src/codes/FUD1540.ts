import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1540`. */
export interface FUD1540Params extends FileInput {
  /**
   * - `line`: neither a header, nor a continuation, nor a comment.
   * - `continuation`: an indented line under a header that has no separator to join it with.
   * - `no-path`: a header of `assets.headers` with no path above it.
   * - `path`: a path line in a file that has no paths.
   * - `unreadable`: the file exists and could not be read.
   */
  readonly problem: 'line' | 'continuation' | 'no-path' | 'path' | 'unreadable';
  /** The header a continuation would join, for `continuation`; why it could not be read, for `unreadable`. */
  readonly name?: string;
}

/** A line of a `.headers` file that is not a header, or a file that cannot be read (SDD-84). */
export const FUD1540 = (p: FUD1540Params): FileDiagnostic => {
  const message =
    p.problem === 'continuation'
      ? `${p.name ?? ''} is not a header fudic can continue on the next line: write its value on one line`
      : p.problem === 'no-path'
        ? 'a header in assets.headers needs a path above it, such as /** for every file'
        : p.problem === 'path'
          ? 'only assets.headers has paths: the headers of this file apply to all it covers'
          : p.problem === 'unreadable'
            ? `${p.file} could not be read: ${p.name ?? ''}`
            : 'this line is not a header ("Name: value"), an indented continuation or a # comment';
  return file('FUD1540', 'error', message, p);
};
