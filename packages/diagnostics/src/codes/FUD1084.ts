import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** What is wrong with the arguments. */
export type FUD1084Problem = 'many' | 'few' | 'type';

/** Parameters of `FUD1084`. */
export type FUD1084Params = SourceInput & {
  readonly rule: string;
  /** Its parameters as declared, `n u32`, or `no arguments`. */
  readonly signature: string;
  readonly problem: FUD1084Problem;
};

const WHY: Readonly<Record<FUD1084Problem, string>> = {
  many: 'too many arguments',
  few: 'missing arguments',
  type: 'an argument of the wrong type',
};

/** A rule given the wrong number or kind of arguments (SDD-60). */
export const FUD1084 = (p: FUD1084Params): SourceDiagnostic =>
  source('FUD1084', 'error', `${WHY[p.problem]} for rule \`${p.rule}\`: it takes ${p.signature}`, p);
