import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0892`. */
export interface FUD0892Params extends SourceInput {
  /** The slot the layout already puts the hole in. */
  readonly slot: string;
}

/** An element at the root of a slotted hole that writes its own `slot=` (SDD-48). */
export const FUD0892 = (p: FUD0892Params): SourceDiagnostic =>
  source(
    'FUD0892',
    'error',
    `the layout already puts this hole in the slot "${p.slot}": remove this \`slot\``,
    p,
  );
