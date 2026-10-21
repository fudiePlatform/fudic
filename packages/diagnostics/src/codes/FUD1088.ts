import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1088`. */
export type FUD1088Params = SourceInput & {
  readonly type: string;
  /** The chain of types back to itself: `Node → Child → Node`. */
  readonly cycle: string;
};

/** A `type` that contains itself without a list, an optional or a map in between (SDD-60). */
export const FUD1088 = (p: FUD1088Params): SourceDiagnostic =>
  source('FUD1088', 'error', `type \`${p.type}\` contains itself (${p.cycle}): no value of it could ever be written`, p);
