import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1542`. */
export interface FUD1542Params extends FileInput {
  /** The header as written, or the path of the block for `path`. */
  readonly name: string;
  /** `header`: a header fudic sends itself. `path`: a block of `assets.headers` on a file fudic serves itself. */
  readonly problem: 'header' | 'path';
}

/** A header, or an `assets.headers` block, that fudic decides itself (SDD-84). */
export const FUD1542 = (p: FUD1542Params): FileDiagnostic =>
  file(
    'FUD1542',
    'error',
    p.problem === 'path'
      ? `${p.name} is served by fudic with its own headers: a block for it does nothing but mislead`
      : `${p.name} is sent by fudic itself in this file: writing it would stop fudic from working`,
    p,
  );
