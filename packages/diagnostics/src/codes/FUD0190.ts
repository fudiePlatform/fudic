import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0190`. */
export interface FUD0190Params extends SourceInput {
  /** The repeated attribute name, verbatim. */
  readonly name: string;
}

/** The same attribute written twice on one element (SDD-12). */
export const FUD0190 = (p: FUD0190Params): SourceDiagnostic =>
  source('FUD0190', 'error', `duplicate attribute \`${p.name}\``, p);
