import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** A layout under the routes directory that no route references (SDD-21). */
export const FUD0434 = (p: FileInput): FileDiagnostic =>
  file('FUD0434', 'warning', 'Layout is not referenced by any route: it renders nothing', p);
