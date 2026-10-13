import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1001`. */
export type FUD1001Params = SourceInput & {
  /** The exported name. */
  readonly name: string;
};

/** An exported server-function builder that never reaches `.handle(…)` (SDD-56). */
export const FUD1001 = (p: FUD1001Params): SourceDiagnostic =>
  source(
    'FUD1001',
    'error',
    `\`${p.name}\` is a builder, not a server function: close it with \`.handle((ctx) => …)\``,
    p,
  );
