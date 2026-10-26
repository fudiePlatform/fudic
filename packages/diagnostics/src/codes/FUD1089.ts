import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1089`. */
export type FUD1089Params = SourceInput & {
  /** The key type, as written. */
  readonly key: string;
};

/** A `map` whose key is not text or a whole number (SDD-60). */
export const FUD1089 = (p: FUD1089Params): SourceDiagnostic =>
  source('FUD1089', 'error', `\`${p.key}\` cannot be a map key: use \`str\`, \`uuid\` or an integer type`, p);
