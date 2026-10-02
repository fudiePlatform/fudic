import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0942`. */
export interface FUD0942Params extends SourceInput {
  /** What `meta.name` says. */
  readonly name: string;
  /** What the file name says. */
  readonly term: string;
}

/** A term module whose `meta.name` is not its file name (SDD-52). */
export const FUD0942 = (p: FUD0942Params): SourceDiagnostic =>
  source('FUD0942', 'error', `meta.name is "${p.name}" but the file is the term "${p.term}"`, p);
