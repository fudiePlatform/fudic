import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1115`. */
export type FUD1115Params = SourceInput & {
  /** The `href` of the other route's `.fudapi`. */
  readonly href: string;
};

/** A route that links the `.fudapi` of another route, which has `load` (SDD-60). */
export const FUD1115 = (p: FUD1115Params): SourceDiagnostic =>
  source('FUD1115', 'error', `"${p.href}" is another route's contract and declares \`load\`: a route links only its own`, p);
