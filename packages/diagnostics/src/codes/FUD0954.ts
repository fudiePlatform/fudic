import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0954`. */
export interface FUD0954Params extends SourceInput {
  readonly name: string;
}

/** Two parameters of `meta.params` with the same name (SDD-52). */
export const FUD0954 = (p: FUD0954Params): SourceDiagnostic =>
  source('FUD0954', 'error', `parameter "${p.name}" is declared twice`, p);
