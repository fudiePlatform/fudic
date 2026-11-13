import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1544`. */
export interface FUD1544Params extends FileInput {
  readonly directive: string;
}

/** A Content-Security-Policy directive that does not exist (SDD-84). */
export const FUD1544 = (p: FUD1544Params): FileDiagnostic =>
  file('FUD1544', 'warning', `"${p.directive}" is not a CSP directive: the browser ignores it`, p);
