import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0806`; `file` is the piece's file in its package. */
export interface FUD0806Params extends FileInput {
  /** The piece's origin-absolute URL. */
  readonly url: string;
  /** The package that publishes it. */
  readonly pkg: string;
}

/** A published runtime piece that carries the build token (SDD-45). */
export const FUD0806 = (p: FUD0806Params): FileDiagnostic =>
  file(
    'FUD0806',
    'error',
    `the piece "${p.url}" carries this build's token. A published piece is the ` +
      'same bytes for every application and every deploy, so it cannot hold a fact of ' +
      'one of them: something that belongs to the application was compiled into code ' +
      `that belongs to the framework, in "${p.pkg}".`,
    p,
  );
