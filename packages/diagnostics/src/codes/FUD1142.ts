import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1142`. */
export interface FUD1142Params extends SourceInput {
  /** The operator, as written: `==`, `typeof`, `**`. */
  readonly operator: string;
}

/** An operator outside the view's portable set (SDD-61). */
export const FUD1142 = (p: FUD1142Params): SourceDiagnostic =>
  source('FUD1142', 'error', `\`${p.operator}\` does not port: it has no equivalent with the same result in every backend`, p);
