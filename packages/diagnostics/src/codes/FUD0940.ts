import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0940`. */
export interface FUD0940Params extends SourceInput {
  /** The term as the line names it, normalized to kebab-case. */
  readonly term: string;
  readonly block: string;
  /** Every term of that block, in every layer. */
  readonly available: readonly string[];
}

/** A `.fudspec` line names a term no layer has in its block (SDD-52). */
export const FUD0940 = (p: FUD0940Params): SourceDiagnostic =>
  source('FUD0940', 'error', `unknown \`${p.block}\` term \`${p.term}\`; \`${p.block}\` terms: [${p.available.join(', ')}]`, p);
