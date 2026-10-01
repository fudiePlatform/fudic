import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0194`. */
export interface FUD0194Params extends SourceInput {
  /** The repeated region. */
  readonly region: '@server' | '@client';
}

/** A second `@server` or `@client` region in one `@code` (SDD-12). */
export const FUD0194 = (p: FUD0194Params): SourceDiagnostic =>
  source('FUD0194', 'error', `at most one \`${p.region}\` region is allowed per \`@code\``, p);
