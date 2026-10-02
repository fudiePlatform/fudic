import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0929`. */
export interface FUD0929Params extends SourceInput {
  /** The first word of the line. */
  readonly found: string;
}

/** A line at indentation 2 that is not `given`, `when` or `then` (`.fudspec`). */
export const FUD0929 = (p: FUD0929Params): SourceDiagnostic =>
  source('FUD0929', 'error', `expected \`given\`, \`when\` or \`then\`, found \`${p.found}\``, p);
