import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0927`. */
export interface FUD0927Params extends SourceInput {
  /** The slug written twice. */
  readonly slug: string;
}

/** Two criteria with the same slug in one file (`.fudspec`). */
export const FUD0927 = (p: FUD0927Params): SourceDiagnostic =>
  source('FUD0927', 'error', `a criterion named \`${p.slug}\` already exists in this file`, p);
