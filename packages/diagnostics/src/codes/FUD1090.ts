import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1090`. */
export type FUD1090Params = SourceInput & {
  /** `load`, `paths` or `layout`. */
  readonly keyword: string;
};

/** `load`, `paths` or `layout` in a `.fudapi` that is not the sibling of a route (SDD-60). */
export const FUD1090 = (p: FUD1090Params): SourceDiagnostic =>
  source('FUD1090', 'error', `\`${p.keyword}\` only goes in the \`.fudapi\` next to a route, under \`src/routes\``, p);
