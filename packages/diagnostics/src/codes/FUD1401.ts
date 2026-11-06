import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1401`; `file` is the path that could not be read. */
export interface FUD1401Params extends FileInput {
  /** Why: there is no such file, or it is not text. */
  readonly reason: 'missing' | 'binary';
}

/** The MCP was asked to read a file that does not exist or is not text (SDD-77). */
export const FUD1401 = (p: FUD1401Params): FileDiagnostic =>
  file('FUD1401', 'error', p.reason === 'missing' ? `${p.file} does not exist` : `${p.file} is not a text file`, p);
