import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1511`. */
export interface FUD1511Params extends SourceInput {
  /** As written, relative to the `.fudspec`. */
  readonly path: string;
}

/** `upload` with a file that does not exist (`.fudspec`) (SDD-82). */
export const FUD1511 = (p: FUD1511Params): SourceDiagnostic =>
  source('FUD1511', 'error', `no file ${p.path} next to the spec`, p);
