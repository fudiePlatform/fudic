import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0429`. */
export interface FUD0429Params extends SourceInput {
  /** The section's name. */
  readonly section: string;
}

/** A `@section` that no `@RenderSection` of the layout renders (SDD-21). */
export const FUD0429 = (p: FUD0429Params): SourceDiagnostic =>
  source(
    'FUD0429',
    'warning',
    `no @RenderSection(${p.section}) in the layout chain: this section is not rendered`,
    p,
  );
