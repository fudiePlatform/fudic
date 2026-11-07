import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1441`. */
export interface FUD1441Params extends SourceInput {
  /** The adopted piece. */
  readonly name: string;
}

/** An adopted piece of the guide none of whose rules can match the component's shadow (SDD-79). */
export const FUD1441 = (p: FUD1441Params): SourceDiagnostic =>
  source(
    'FUD1441',
    'warning',
    `"${p.name}" styles nothing in this component: no rule of it can match its template. ` +
      'Remove it unless a script creates what it styles',
    p,
  );
