import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0973`; `file` is the fixture. */
export interface FUD0973Params extends FileInput {
  /** The message of what the fixture threw. */
  readonly reason: string;
}

/** The fixture threw when the workbench executed it (SDD-32). */
export const FUD0973 = (p: FUD0973Params): FileDiagnostic =>
  file('FUD0973', 'error', `the fixture threw when executed: ${p.reason}`, p);
