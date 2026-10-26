import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** What is wrong with the parameter. */
export type FUD1087Problem = 'missing' | 'extra' | 'type';

/** Parameters of `FUD1087`. */
export type FUD1087Params = SourceInput & {
  readonly middleware: string;
  readonly param: string;
  readonly problem: FUD1087Problem;
};

const WHY: Readonly<Record<FUD1087Problem, string>> = {
  missing: 'is required and not given',
  extra: 'is not one of its parameters',
  type: 'is given a value of the wrong type',
};

/** A `use` whose parameter lines do not match the middleware's parameters (SDD-60). */
export const FUD1087 = (p: FUD1087Params): SourceDiagnostic =>
  source('FUD1087', 'error', `\`${p.param}\` of middleware \`${p.middleware}\` ${WHY[p.problem]}`, p);
