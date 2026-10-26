import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1078`. */
export type FUD1078Params = SourceInput & {
  /** The keyword of the declaration that does not fit: `rule`, `get`… */
  readonly keyword: string;
  /** What the file already is, by its first declaration. */
  readonly kind: 'contract' | 'extensions';
};

/** A `.fudapi` that mixes contract declarations with extension ones (SDD-60). */
export const FUD1078 = (p: FUD1078Params): SourceDiagnostic =>
  source(
    'FUD1078',
    'error',
    `\`${p.keyword}\` does not belong in a ${p.kind} file: contracts and extensions go in separate files`,
    p,
  );
