import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0057`. */
export interface FUD0057Params extends SourceInput {
  /** The character reference as written, e.g. `&nbps;`. */
  readonly reference: string;
}

/** A named character reference HTML does not define (SDD-05). */
export const FUD0057 = (p: FUD0057Params): SourceDiagnostic =>
  source('FUD0057', 'error', `unknown character reference ${p.reference}`, p);
