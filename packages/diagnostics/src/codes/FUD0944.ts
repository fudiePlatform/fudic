import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0944`. */
export interface FUD0944Params extends SourceInput {
  /** The type the parameter declares. */
  readonly type: string;
}

/** A term parameter whose `type` is not in the closed list (SDD-52). */
export const FUD0944 = (p: FUD0944Params): SourceDiagnostic =>
  source('FUD0944', 'error', `unknown parameter type "${p.type}": it is one of element, number, string, token`, p);
