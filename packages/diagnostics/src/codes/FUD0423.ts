import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0423`. */
export interface FUD0423Params extends SourceInput {
  /**
   * The file a `<link rel="layout">` points at, when the problem is found from the route that
   * links it. Absent when it is found in the layout itself.
   */
  readonly path?: string;
}

/** A layout without `@RenderBody()` (SDD-21, SDD-48). */
export const FUD0423 = (p: FUD0423Params): SourceDiagnostic =>
  source(
    'FUD0423',
    'error',
    `a layout must contain @RenderBody(): ${p.path ?? 'where does the route go?'}`,
    p,
  );
