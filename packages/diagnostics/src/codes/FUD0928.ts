import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0928`. */
export interface FUD0928Params extends SourceInput {
  /** The first word of the line. */
  readonly found: string;
}

/** An unindented line that is neither a header nor `criterion` (`.fudspec`) (SDD-52, SDD-82). */
export const FUD0928 = (p: FUD0928Params): SourceDiagnostic =>
  source('FUD0928', 'error', `expected \`component\`, \`page\`, \`flow\` or \`criterion\`, found \`${p.found}\``, p);
