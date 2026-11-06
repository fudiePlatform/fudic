import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1400`; `file` is the path as the caller wrote it. */
export type FUD1400Params = FileInput;

/** A path the MCP was given leaves the project, or enters `.git`, `node_modules` or `.fudic` (SDD-77). */
export const FUD1400 = (p: FUD1400Params): FileDiagnostic =>
  file('FUD1400', 'error', `${p.file} is outside the project: only files inside it can be read or written`, p);
