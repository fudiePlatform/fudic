import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1085`. */
export type FUD1085Params = SourceInput & {
  /** The placeholder without braces. */
  readonly placeholder: string;
  /** What the text can name, as a phrase: `{n}`, or `nothing`. */
  readonly offered: string;
};

/** A `{x}` in a text that nothing fills (SDD-60). */
export const FUD1085 = (p: FUD1085Params): SourceDiagnostic =>
  source('FUD1085', 'error', `\`{${p.placeholder}}\` is not filled here: this text can use ${p.offered}`, p);
