import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1062`. */
export type FUD1062Params = SourceInput & {
  /** The word the line starts with. */
  readonly word: string;
  /** The declarations a line at level 0 can start. */
  readonly expected: readonly string[];
};

/** A `.fudapi` line at level 0 that starts no declaration (SDD-60). */
export const FUD1062 = (p: FUD1062Params): SourceDiagnostic =>
  source(
    'FUD1062',
    'error',
    `unknown declaration \`${p.word}\`: expected one of ${p.expected.map((w) => `\`${w}\``).join(', ')}`,
    p,
  );
