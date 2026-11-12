import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0924`. */
export interface FUD0924Params extends SourceInput {
  /** The header keyword. */
  readonly keyword: 'component' | 'page' | 'flow';
}

/** A header after the first criterion (`.fudspec`) (SDD-52, SDD-82). */
export const FUD0924 = (p: FUD0924Params): SourceDiagnostic =>
  source('FUD0924', 'error', `\`${p.keyword}\` goes before the first \`criterion\``, p);
