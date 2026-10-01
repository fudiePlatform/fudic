import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0501`; `file` is the name the chunks would share. */
export interface FUD0501Params extends FileInput {
  /** The chunks that reduce to that name. */
  readonly claimants: readonly string[];
}

/** Two chunks that would get the same name after build-id naming (SDD-27). */
export const FUD0501 = (p: FUD0501Params): FileDiagnostic =>
  file(
    'FUD0501',
    'warning',
    `chunk name collision after build-id naming: "${p.file}" is produced by ${p.claimants.join(' and ')}`,
    p,
  );
