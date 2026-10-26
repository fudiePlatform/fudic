import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1069`. */
export type FUD1069Params = SourceInput & {
  /** The token the expression could not go on from, or `end of line`. */
  readonly near: string;
};

/** A `require` or `when` expression that does not parse (SDD-60). */
export const FUD1069 = (p: FUD1069Params): SourceDiagnostic =>
  source('FUD1069', 'error', `malformed expression near \`${p.near}\``, p);
