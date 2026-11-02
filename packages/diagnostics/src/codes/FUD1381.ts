import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1381`. */
export interface FUD1381Params extends SourceInput {
  /** The event of the marker's list nobody listens to. */
  readonly event: string;
  /** The marker's name after `delegate:`. */
  readonly name: string;
}

/** A marker serves an event no ancestor handler of that event reads it in (SDD-72). */
export const FUD1381 = (p: FUD1381Params): SourceDiagnostic =>
  source(
    'FUD1381',
    'error',
    `no ancestor \`@${p.event}\` reads \`${p.name}\`: this marker serves an event nobody listens to`,
    p,
  );
