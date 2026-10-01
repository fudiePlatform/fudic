import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0200`. */
export interface FUD0200Params extends SourceInput {
  /** The prop, without the leading `.`. */
  readonly prop: string;
}

/** A `Signal<T>` prop fed something that is not the bare name of a reactive (BUG-24). */
export const FUD0200 = (p: FUD0200Params): SourceDiagnostic =>
  source(
    'FUD0200',
    'error',
    `\`.${p.prop}\` takes a Signal by reference: name a signal(…) or computed(…)`,
    p,
  );
