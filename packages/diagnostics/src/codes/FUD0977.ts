import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0977`; `file` is the component, `project` the workbench's root. */
export type FUD0977Params = FileInput & { readonly project: string };

/** A component of another project asked of a workbench (BUG-48). */
export const FUD0977 = (p: FUD0977Params): FileDiagnostic =>
  file('FUD0977', 'error', `${p.file} is not in the project ${p.project}: a workbench serves one project`, p);
