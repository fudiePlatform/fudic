import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1076`. */
export type FUD1076Params = SourceInput & {
  readonly name: string;
};

/** A field or argument named with a word its context reserves (SDD-60). */
export const FUD1076 = (p: FUD1076Params): SourceDiagnostic =>
  source('FUD1076', 'error', `\`${p.name}\` is reserved here and cannot name a field or an argument`, p);
