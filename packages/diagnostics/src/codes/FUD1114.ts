import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1114`. */
export type FUD1114Params = SourceInput & {
  /** `load`, `paths` or `layout`. */
  readonly keyword: string;
};

/** A component that links a `.fudapi` with `load`, `paths` or `layout` (SDD-60). */
export const FUD1114 = (p: FUD1114Params): SourceDiagnostic =>
  source('FUD1114', 'error', `a component has no page: it cannot link a \`.fudapi\` with \`${p.keyword}\``, p);
