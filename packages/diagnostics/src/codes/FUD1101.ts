import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** What is wrong with the type. */
export type FUD1101Problem = 'scalar' | 'optional';

/** Parameters of `FUD1101`. */
export type FUD1101Params = SourceInput & {
  readonly name: string;
  readonly problem: FUD1101Problem;
};

const WHY: Readonly<Record<FUD1101Problem, string>> = {
  scalar: 'travels in the URL, so it is one value: text, a number, a boolean, a date, a uuid or an enum',
  optional: 'is a segment of the route, which cannot be missing',
};

/** A route or query argument whose type does not fit in a URL (SDD-60). */
export const FUD1101 = (p: FUD1101Params): SourceDiagnostic =>
  source('FUD1101', 'error', `\`${p.name}\` ${WHY[p.problem]}`, p);
