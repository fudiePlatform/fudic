import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0098`. */
export interface FUD0098Params extends SourceInput {
  /** The prefix written before the expression name, e.g. `on:`. */
  readonly prefix: string;
}

/** An expression attribute name after a prefix other than `bus:` (SDD-07). */
export const FUD0098 = (p: FUD0098Params): SourceDiagnostic =>
  source(
    'FUD0098',
    'error',
    `an expression attribute name is only valid after the reserved \`bus:\` prefix, not \`${p.prefix}\``,
    p,
  );
