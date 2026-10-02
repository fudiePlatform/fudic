import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0953`. */
export interface FUD0953Params extends SourceInput {
  readonly tag: string;
}

/** `props` with no fixture file next to the component (SDD-52). */
export const FUD0953 = (p: FUD0953Params): SourceDiagnostic =>
  source('FUD0953', 'error', `no ${p.tag}.fixture.ts next to the component`, p);
