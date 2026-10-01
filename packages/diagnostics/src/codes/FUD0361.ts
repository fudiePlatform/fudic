import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0361`; `file` is the page that loses. */
export interface FUD0361Params extends FileInput {
  /** The route pattern both files produce. */
  readonly pattern: string;
  /** The page that produced the pattern first, and keeps it. */
  readonly owner: string;
}

/** Two route files resolve to the same pattern (SDD-19). */
export const FUD0361 = (p: FUD0361Params): FileDiagnostic =>
  file('FUD0361', 'warning', `Route "${p.pattern}" is produced by both ${p.owner} and ${p.file}`, p);
