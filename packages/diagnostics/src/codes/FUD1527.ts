import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1527`. */
export interface FUD1527Params extends FileInput {
  /** The id as written in `allow`. */
  readonly id: string;
  /** Where it went: one id when it moved, several when it was split; absent when it never existed. */
  readonly to?: readonly string[];
  readonly kind?: 'moved' | 'split';
}

/** An id of `baseline.allow` that is not a feature, or a feature that moved or was split (SDD-83). */
export const FUD1527 = (p: FUD1527Params): FileDiagnostic => {
  const to = (p.to ?? []).map((id) => `"${id}"`).join(', ');
  const message =
    p.kind === 'moved'
      ? `"${p.id}" in "allow" is now ${to}: it is allowed under that id`
      : p.kind === 'split'
        ? `"${p.id}" in "allow" was split into ${to}: all of them are allowed`
        : `"${p.id}" in "allow" is not a web-features id, so it allows nothing`;
  return file('FUD1527', 'warning', message, p);
};
