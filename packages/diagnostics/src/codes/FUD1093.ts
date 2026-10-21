import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1093`. */
export type FUD1093Params = SourceInput & {
  readonly code: string;
};

/** A `fails` code declared twice in one declaration (SDD-60). */
export const FUD1093 = (p: FUD1093Params): SourceDiagnostic =>
  source('FUD1093', 'error', `\`${p.code}\` already fails in this declaration`, p);
