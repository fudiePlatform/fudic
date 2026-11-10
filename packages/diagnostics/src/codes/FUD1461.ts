import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1461`. */
export interface FUD1461Params extends SourceInput {
  /** The clause written: `use` or `skip`. */
  readonly clause: string;
}

/** `use` or `skip` in a `.fudapi` rule that `runs both` (SDD-80). */
export const FUD1461 = (p: FUD1461Params): SourceDiagnostic =>
  source(
    'FUD1461',
    'error',
    `\`${p.clause}\` needs a rule the server runs (\`runs server\` or \`runs remote\`): this one runs \`both\`, and middlewares never run in the browser`,
    p,
  );
