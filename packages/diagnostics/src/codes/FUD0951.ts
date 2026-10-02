import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0951`. */
export interface FUD0951Params extends SourceInput {
  readonly tag: string;
  /** The props without `?` in `$Props`. */
  readonly required: readonly string[];
}

/** A criterion without `props` for a component with required props (SDD-52). */
export const FUD0951 = (p: FUD0951Params): SourceDiagnostic =>
  source('FUD0951', 'error', `<${p.tag}> has required props [${p.required.join(', ')}]: the criterion needs a props line in given`, p);
