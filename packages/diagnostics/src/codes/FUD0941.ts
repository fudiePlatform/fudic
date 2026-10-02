import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0941`. */
export interface FUD0941Params extends SourceInput {
  /** What could not be read: a missing `meta`, a field that is not a literal, a syntax error. */
  readonly detail: string;
}

/** A term module whose `meta` cannot be read statically (SDD-52). */
export const FUD0941 = (p: FUD0941Params): SourceDiagnostic =>
  source('FUD0941', 'error', `the term module's meta cannot be read without running it: ${p.detail}`, p);
