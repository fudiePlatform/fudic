import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0661`. */
export interface FUD0661Params extends SourceInput {
  /** The delegated name, without the leading `$`. */
  readonly name: string;
}

/** A `delegate:name` marker no ancestor handler reads (SDD-37). */
export const FUD0661 = (p: FUD0661Params): SourceDiagnostic =>
  source(
    'FUD0661',
    'error',
    `no ancestor handler reads \`$${p.name}\`: this marker is never read`,
    p,
  );
