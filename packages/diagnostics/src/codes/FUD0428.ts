import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0428`. */
export interface FUD0428Params extends SourceInput {
  /** A declared `@section`, or a `@RenderSection` hole. */
  readonly what: 'section' | 'rendered section';
  /** The repeated name. */
  readonly name: string;
}

/** A section name declared or rendered twice (SDD-21). */
export const FUD0428 = (p: FUD0428Params): SourceDiagnostic =>
  source('FUD0428', 'error', `duplicate ${p.what} "${p.name}"`, p);
