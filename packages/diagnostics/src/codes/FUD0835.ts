import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0835`. */
export interface FUD0835Params extends SourceInput {
  /** The cycle, from the snippet that starts it back to itself. */
  readonly names: readonly string[];
}

/** A snippet that expands into itself, directly or through others (SDD-29). */
export const FUD0835 = (p: FUD0835Params): SourceDiagnostic =>
  source('FUD0835', 'error', `a snippet cannot expand into itself: ${p.names.join(' → ')}`, p);
