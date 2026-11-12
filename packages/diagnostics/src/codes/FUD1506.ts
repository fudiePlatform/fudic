import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1506`. */
export interface FUD1506Params extends SourceInput {
  readonly fn: string;
  /** Every function in reach. */
  readonly available: readonly string[];
}

/** `called` or `sent` with a function the page or the flow cannot call (`.fudspec`) (SDD-82). */
export const FUD1506 = (p: FUD1506Params): SourceDiagnostic =>
  source('FUD1506', 'error', `\`${p.fn}\` is not a function in reach; functions: [${p.available.join(', ')}]`, p);
