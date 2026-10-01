import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** A route that declares `strategy()` and also appears in the plugin's defaults (SDD-20). */
export const FUD0397 = (p: FileInput): FileDiagnostic =>
  file('FUD0397', 'warning', 'This route declares strategy() and also appears in defaults; the page wins', p);
