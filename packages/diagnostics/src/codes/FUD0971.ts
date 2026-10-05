import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0971`; `file` is the component. */
export type FUD0971Params = FileInput;

/** No `fudic.json` nor `package.json` above the component (SDD-32). */
export const FUD0971 = (p: FUD0971Params): FileDiagnostic =>
  file('FUD0971', 'error', `no fudic.json or package.json above ${p.file}: there is no project to serve it from`, p);
