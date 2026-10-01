import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0170`. */
export interface FUD0170Params extends SourceInput {
  /** Oxc's own message, which is the whole message. */
  readonly detail: string;
}

/** A JavaScript/TypeScript syntax error reported by Oxc, mapped back to the source (SDD-11). */
export const FUD0170 = (p: FUD0170Params): SourceDiagnostic =>
  source('FUD0170', 'error', p.detail, p);
