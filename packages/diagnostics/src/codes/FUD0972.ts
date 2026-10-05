import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0972`; `file` is the component. */
export type FUD0972Params = FileInput;

/** The component opened in the workbench has no `.fudspec` (SDD-32). */
export const FUD0972 = (p: FUD0972Params): FileDiagnostic =>
  file('FUD0972', 'warning', `${p.file} has no .fudspec: the workbench opens it without criteria`, p);
