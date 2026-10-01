import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0202`. */
export interface FUD0202Params extends SourceInput {
  /** The child component's tag. */
  readonly tag: string;
  /** The prop, without the leading `.`. */
  readonly prop: string;
}

/** A reactive cell passed to a component that does not hydrate (BUG-24). */
export const FUD0202 = (p: FUD0202Params): SourceDiagnostic =>
  source(
    'FUD0202',
    'error',
    `\`${p.tag}\` does not hydrate, so it can never receive \`.${p.prop}\` by reference`,
    p,
  );
