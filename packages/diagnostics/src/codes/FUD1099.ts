import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1099`. */
export type FUD1099Params = SourceInput & {
  readonly param: string;
};

/** A `:x` in a function route without an argument `x` (SDD-60). */
export const FUD1099 = (p: FUD1099Params): SourceDiagnostic =>
  source('FUD1099', 'error', `the route names \`:${p.param}\` but the function has no argument \`${p.param}\``, p);
