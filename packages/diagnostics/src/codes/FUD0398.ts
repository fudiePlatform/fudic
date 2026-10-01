import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** An `ssg` param route with no `paths()` to enumerate (SDD-20). */
export const FUD0398 = (p: FileInput): FileDiagnostic =>
  file('FUD0398', 'warning', 'A param route needs paths() to be prerendered; falling back to sw', p);
