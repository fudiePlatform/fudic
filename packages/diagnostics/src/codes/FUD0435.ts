import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0435`. */
export interface FUD0435Params extends SourceInput {
  /** The path the link points at. */
  readonly path: string;
}

/** A `<link rel="layout">` that points at a file that is not a layout (SDD-21). */
export const FUD0435 = (p: FUD0435Params): SourceDiagnostic =>
  source('FUD0435', 'error', `<link rel="layout"> must point at a layout: ${p.path}`, p);
