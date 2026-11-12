import { file, source } from '../make.js';
import type { FileDiagnostic, FileInput, FudCode, SourceDiagnostic, SourceInput } from '../types.js';

/** What every form of `FUD1520` says: the code as written, and what replaced it when it was retired. */
interface FUD1520Base {
  /** The code as the author wrote it. */
  readonly code: string;
  /** The codes that replaced it, when it is a retired one; absent or empty when it never existed. */
  readonly replacedBy?: readonly FudCode[];
}

/** In the `diagnostics` of `fudic.json`: the key. */
export interface FUD1520PolicyParams extends FUD1520Base, FileInput {
  readonly place: 'policy';
}

/** In a `fud-disable` comment: the comment. */
export interface FUD1520CommentParams extends FUD1520Base, SourceInput {
  readonly place: 'comment';
}

/**
 * A code that does not exist, or is retired, named where a code is configured or silenced
 * (SDD-83). The entry or the code is left out; the rest of the policy or the comment applies.
 */
export interface FUD1520Code {
  (p: FUD1520PolicyParams): FileDiagnostic;
  (p: FUD1520CommentParams): SourceDiagnostic;
}

function what(p: FUD1520Base): string {
  const replaced = p.replacedBy ?? [];
  return replaced.length === 0
    ? `${p.code} is not a fudic code`
    : `${p.code} is retired: it was replaced by ${replaced.join(', ')}`;
}

export const FUD1520 = ((p: FUD1520PolicyParams | FUD1520CommentParams) =>
  p.place === 'policy'
    ? file('FUD1520', 'warning', `${what(p)}, so its entry in "diagnostics" does nothing`, p)
    : source('FUD1520', 'warning', `${what(p)}, so this comment does not silence it`, p)) as FUD1520Code;
