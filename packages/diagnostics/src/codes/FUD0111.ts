import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0111`. */
export interface FUD0111Params extends SourceInput {
  /** The region keyword, without its `@`: `server` or `client`. */
  readonly name: string;
}

/** `@server` / `@client` written with a parameter list (SDD-08). */
export const FUD0111 = (p: FUD0111Params): SourceDiagnostic =>
  source('FUD0111', 'error', `@${p.name} does not take a parameter`, p);
