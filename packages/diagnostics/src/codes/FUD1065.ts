import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1065`. */
export type FUD1065Params = SourceInput & {
  /** The word the line starts with. */
  readonly word: string;
  /** The line it hangs from: `load`, `form userForm`, `middleware auth`… */
  readonly parent: string;
  /** The words a line can start with there. */
  readonly expected: readonly string[];
};

function expected(words: readonly string[]): string {
  return words.length === 0
    ? 'nothing goes below it'
    : `expected one of ${words.map((w) => `\`${w}\``).join(', ')}`;
}

/** A `.fudapi` line that its parent does not take (SDD-60). */
export const FUD1065 = (p: FUD1065Params): SourceDiagnostic =>
  source('FUD1065', 'error', `\`${p.word}\` is not valid under \`${p.parent}\`: ${expected(p.expected)}`, p);
