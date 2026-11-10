import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1481`. */
export type FUD1481Params = SourceInput & {
  /** What carries it: `load`, `layout`, `paths`. */
  readonly where: string;
};

/** A `file` in what a page renders from (SDD-81). */
export const FUD1481 = (p: FUD1481Params): SourceDiagnostic =>
  source(
    'FUD1481',
    'error',
    `a file cannot be page data: \`${p.where}\` reaches a \`file\`; serve it from a \`get\` with \`-> file\` and link its \`url()\``,
    p,
  );
