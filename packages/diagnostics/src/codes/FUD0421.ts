import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0421`. */
export interface FUD0421Params extends SourceInput {
  /** A node out of phase, a second `<head>`, or a `@section` below the top level. */
  readonly kind: 'order' | 'head' | 'nested-section';
}

const MESSAGES: Readonly<Record<FUD0421Params['kind'], string>> = {
  order: 'Top-level order must be layout link → component links → @code → head → markup',
  head: 'A route has at most one <head> fragment',
  'nested-section': '@section must be a top-level node of the route',
};

/** A route's top level out of order, with a second `<head>`, or a nested `@section` (SDD-21). */
export const FUD0421 = (p: FUD0421Params): SourceDiagnostic =>
  source('FUD0421', 'error', MESSAGES[p.kind], p);
