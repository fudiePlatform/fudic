import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** `--layout <file>` names a file that is not a layout; `file` is it (SDD-22). */
export const FUD0449 = (p: FileInput): FileDiagnostic =>
  file('FUD0449', 'error', `"${p.file}" is not a layout (no doctype + @RenderBody())`, p);
