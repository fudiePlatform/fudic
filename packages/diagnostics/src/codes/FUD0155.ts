import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0155`. */
export interface FUD0155Params extends SourceInput {
  /** A node out of phase, or a second `<head>` fragment. */
  readonly kind: 'order' | 'head';
}

/** A component's top level out of order, or with a second `<head>` (SDD-10). */
export const FUD0155 = (p: FUD0155Params): SourceDiagnostic =>
  source(
    'FUD0155',
    'error',
    p.kind === 'order'
      ? 'Top-level order must be link → @code → head → host'
      : 'A component has at most one <head> fragment',
    p,
  );
