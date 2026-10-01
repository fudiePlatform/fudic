import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0110`. */
export interface FUD0110Params extends SourceInput {
  /** The keyword missing its body, without its `@`: `code`, `server` or `client`. */
  readonly name: string;
}

/** `@code`, `@server` or `@client` not followed by `{` (SDD-08). */
export const FUD0110 = (p: FUD0110Params): SourceDiagnostic =>
  source('FUD0110', 'error', `Expected '{' after @${p.name}`, p);
