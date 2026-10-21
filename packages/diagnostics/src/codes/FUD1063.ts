import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1063`. */
export type FUD1063Params = SourceInput & {
  /** The keyword that opens the declaration: `type`, `get`, `rule`… */
  readonly keyword: string;
};

/** A `.fudapi` declaration without its name (SDD-60). */
export const FUD1063 = (p: FUD1063Params): SourceDiagnostic =>
  source('FUD1063', 'error', `\`${p.keyword}\` needs a name`, p);
