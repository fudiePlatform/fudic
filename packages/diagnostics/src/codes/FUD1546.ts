import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1546`. */
export interface FUD1546Params extends FileInput {
  /** The text as written: `'nonce-abc'`, `{other}`, `{nonce}`. */
  readonly text: string;
  /**
   * - `literal`: a nonce written by hand.
   * - `unknown`: a `{name}` that is not a placeholder.
   * - `misplaced`: `{nonce}` outside `'nonce-{nonce}'` of the CSP.
   * - `file`: `{nonce}` outside `page.headers`.
   */
  readonly problem: 'literal' | 'unknown' | 'misplaced' | 'file';
}

/** A placeholder that is not one, or a nonce fixed by hand (SDD-84). */
export const FUD1546 = (p: FUD1546Params): FileDiagnostic => {
  const message =
    p.problem === 'literal'
      ? `${p.text} fixes the nonce for every response: write 'nonce-{nonce}' and fudic fills it per response`
      : p.problem === 'unknown'
        ? `${p.text} is not a placeholder: the only one is {nonce}`
        : p.problem === 'file'
          ? `${p.text} is filled only in page.headers: here it would go out as written`
          : `${p.text} goes only inside 'nonce-{nonce}' of the Content-Security-Policy`;
  return file('FUD1546', 'error', message, p);
};
