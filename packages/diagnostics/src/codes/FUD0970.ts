import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0970`; `file` is the file the workbench was asked to open. */
export type FUD0970Params = FileInput;

/** The workbench was asked to open something that is not a tagged component (SDD-32). */
export const FUD0970 = (p: FUD0970Params): FileDiagnostic =>
  file('FUD0970', 'error', `${p.file} is not a component with a tag, nor the .fudspec of one`, p);
