import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0891`. */
export interface FUD0891Params extends SourceInput {
  /** The slot the layout puts the hole in. */
  readonly slot: string;
}

/** Text at the root of a hole the layout puts in a slot (SDD-48). */
export const FUD0891 = (p: FUD0891Params): SourceDiagnostic =>
  source(
    'FUD0891',
    'error',
    `the layout puts this hole in the slot "${p.slot}", and only an element can carry \`slot\`: wrap this text in an element`,
    p,
  );
