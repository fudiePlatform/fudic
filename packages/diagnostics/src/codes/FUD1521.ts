import { file, source } from '../make.js';
import type { FileDiagnostic, FileInput, FudCode, SourceDiagnostic, SourceInput } from '../types.js';

/** In the `diagnostics` of `fudic.json`: the key, and the level it asked for. */
export interface FUD1521PolicyParams extends FileInput {
  readonly place: 'policy';
  readonly code: FudCode;
  readonly level: string;
}

/** In a `fud-disable` comment: the comment. */
export interface FUD1521CommentParams extends SourceInput {
  readonly place: 'comment';
  readonly code: FudCode;
}

/**
 * An error lowered in `fudic.json` or silenced by a comment (SDD-83). An error always breaks the
 * build, so the entry does not apply and the error is still reported.
 */
export interface FUD1521Code {
  (p: FUD1521PolicyParams): FileDiagnostic;
  (p: FUD1521CommentParams): SourceDiagnostic;
}

export const FUD1521 = ((p: FUD1521PolicyParams | FUD1521CommentParams) =>
  p.place === 'policy'
    ? file(
        'FUD1521',
        'error',
        `"${p.code}": "${p.level}" does not apply: ${p.code} is an error, and an error cannot be lowered`,
        p,
      )
    : source('FUD1521', 'error', `${p.code} is an error, and an error cannot be silenced`, p)) as FUD1521Code;
