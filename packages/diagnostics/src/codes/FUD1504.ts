import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1504`. */
export interface FUD1504Params extends SourceInput {
  readonly route: string;
  /** The params of its pattern. */
  readonly params: readonly string[];
}

/** A criterion of a page with params that gives neither `path` nor `url` (`.fudspec`) (SDD-82). */
export const FUD1504 = (p: FUD1504Params): SourceDiagnostic =>
  source('FUD1504', 'error', `${p.route} has params [${p.params.join(', ')}]: the criterion needs \`path\` or \`url\` in given`, p);
