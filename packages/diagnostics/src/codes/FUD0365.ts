import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** `manifestUrl` is not absolute; `file` is the URL as given (SDD-19). */
export const FUD0365 = (p: FileInput): FileDiagnostic =>
  file('FUD0365', 'error', `manifestUrl must be absolute (SW and WW load the same URL); got "${p.file}"`, p);
