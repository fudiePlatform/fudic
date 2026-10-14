import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1002`. */
export type FUD1002Params = SourceInput & {
  /** The verb written: `put`. */
  readonly verb: string;
};

/** `load` declared with a verb other than `get()` (SDD-56). */
export const FUD1002 = (p: FUD1002Params): SourceDiagnostic =>
  source('FUD1002', 'error', `\`load\` is always a GET: declare it with \`get()\`, not \`${p.verb}()\``, p);
