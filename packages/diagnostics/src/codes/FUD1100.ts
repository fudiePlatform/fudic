import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1100`. */
export type FUD1100Params = SourceInput & {
  readonly name: string;
};

/** A route argument named like a parameter of the page (SDD-60). */
export const FUD1100 = (p: FUD1100Params): SourceDiagnostic =>
  source('FUD1100', 'error', `\`${p.name}\` is already a parameter of the page: \`ctx.params\` would hold two`, p);
