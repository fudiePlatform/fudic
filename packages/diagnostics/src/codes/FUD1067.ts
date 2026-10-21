import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1067`. */
export type FUD1067Params = SourceInput & {
  /** The type as written. */
  readonly text: string;
};

/** A `.fudapi` type that does not have the shape of one (SDD-60). */
export const FUD1067 = (p: FUD1067Params): SourceDiagnostic =>
  source('FUD1067', 'error', `malformed type \`${p.text}\`: write \`T\`, \`T[]\`, \`T?\` or \`map K V\``, p);
