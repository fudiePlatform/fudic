import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0925`. */
export interface FUD0925Params extends SourceInput {
  /** The keyword that is missing its name. */
  readonly keyword: 'component' | 'criterion';
}

/** A `component` or `criterion` keyword with no name after it (`.fudspec`). */
export const FUD0925 = (p: FUD0925Params): SourceDiagnostic =>
  source('FUD0925', 'error', `\`${p.keyword}\` needs a name`, p);
