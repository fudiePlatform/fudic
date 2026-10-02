import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0947`. */
export interface FUD0947Params extends SourceInput {
  readonly term: string;
  /** The number of parameters the term declares. */
  readonly expected: number;
  /** The number of arguments the line gives. */
  readonly actual: number;
}

/** A term line with a different number of arguments than its parameters (SDD-52). */
export const FUD0947 = (p: FUD0947Params): SourceDiagnostic =>
  source('FUD0947', 'error', `\`${p.term}\` takes ${p.expected} argument(s), the line gives ${p.actual}`, p);
