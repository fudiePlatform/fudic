import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0943`. */
export interface FUD0943Params extends SourceInput {
  /** What `meta.block` says. */
  readonly block: string;
  /** The folder the module is in. */
  readonly folder: string;
}

/** A term module whose `meta.block` is not its folder (SDD-52). */
export const FUD0943 = (p: FUD0943Params): SourceDiagnostic =>
  source('FUD0943', 'error', `meta.block is "${p.block}" but the module is in the "${p.folder}" folder`, p);
