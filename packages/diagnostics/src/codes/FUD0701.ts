import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0701`. */
export interface FUD0701Params extends SourceInput {
  /** The layout prop that asks to be reactive. */
  readonly name: string;
}

/** A layout prop asks for a reactive value (`Signal<…>` type or `signal(…)` default) (SDD-40). */
export const FUD0701 = (p: FUD0701Params): SourceDiagnostic =>
  source(
    'FUD0701',
    'error',
    `the layout prop \`${p.name}\` may not be reactive: a layout has no half of client that could repaint it, and a chunk that had to know which of its nodes to repaint would have to anchor them (SDD-39 §4.3)`,
    p,
  );
