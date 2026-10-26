import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** What is wrong in the expression. */
export type FUD1095Problem = 'unknown' | 'types';

/** Parameters of `FUD1095`. */
export type FUD1095Params = SourceInput & {
  /** The path or the operation, as written. */
  readonly text: string;
  readonly problem: FUD1095Problem;
};

const WHY: Readonly<Record<FUD1095Problem, string>> = {
  unknown: 'is not a field of this form or group',
  types: 'mixes values of types that cannot go together',
};

/** A `require` or `when` naming a field that is not there, or mixing types (SDD-60). */
export const FUD1095 = (p: FUD1095Params): SourceDiagnostic =>
  source('FUD1095', 'error', `\`${p.text}\` ${WHY[p.problem]}`, p);
