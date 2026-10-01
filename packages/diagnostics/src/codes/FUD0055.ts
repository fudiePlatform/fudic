import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0055`. */
export interface FUD0055Params extends SourceInput {
  /** The construct keyword with no parser, without its `@`. */
  readonly keyword: string;
}

/** A control or `@code` construct met with no injected parser for it (SDD-05). */
export const FUD0055 = (p: FUD0055Params): SourceDiagnostic =>
  source('FUD0055', 'error', `no parser injected for the @${p.keyword} construct`, p);
