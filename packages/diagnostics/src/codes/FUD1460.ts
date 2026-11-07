import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1460`. */
export interface FUD1460Params extends SourceInput {
  /** Where the rule runs: `both` (also when `runs` is not written) or `server`. */
  readonly runs: string;
}

/** `debounce` in a `.fudapi` rule that does not `runs remote` (SDD-80). */
export const FUD1460 = (p: FUD1460Params): SourceDiagnostic =>
  source(
    'FUD1460',
    'error',
    `\`debounce\` only fits a rule that \`runs remote\`: this one runs \`${p.runs}\` and the browser never asks it`,
    p,
  );
