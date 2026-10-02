import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0949`. */
export interface FUD0949Params extends SourceInput {
  readonly tag: string;
}

/** A `.fudspec` declares a component the workspace does not have (SDD-52). */
export const FUD0949 = (p: FUD0949Params): SourceDiagnostic =>
  source('FUD0949', 'error', `no component <${p.tag}> in the workspace`, p);
