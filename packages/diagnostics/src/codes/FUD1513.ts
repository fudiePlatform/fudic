import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1513`. */
export interface FUD1513Params extends SourceInput {
  readonly route: string;
}

/** `lists` in the spec of a route that declares no `paths` (`.fudspec`) (SDD-82). */
export const FUD1513 = (p: FUD1513Params): SourceDiagnostic =>
  source('FUD1513', 'error', `${p.route} declares no \`paths\`: there is nothing to list`, p);
