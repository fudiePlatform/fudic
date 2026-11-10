import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0953`. */
export interface FUD0953Params extends SourceInput {
  /** The name of the fixture file the line reads: `app-card.fixture.ts`. */
  readonly fixture: string;
}

/** A fixture line with no fixture file beside the spec (SDD-52, SDD-82). */
export const FUD0953 = (p: FUD0953Params): SourceDiagnostic =>
  source('FUD0953', 'error', `no ${p.fixture} beside the spec`, p);
