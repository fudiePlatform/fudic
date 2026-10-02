import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0948`. */
export interface FUD0948Params extends SourceInput {
  /** The parameter the argument goes to. */
  readonly param: string;
  /** Its declared type. */
  readonly type: string;
  /** The form of the argument: `bare`, `string` or `role`. */
  readonly form: string;
}

/** An argument whose form the parameter's type does not accept (SDD-52). */
export const FUD0948 = (p: FUD0948Params): SourceDiagnostic =>
  source('FUD0948', 'error', `\`${p.param}\` is ${p.type} and does not take a ${p.form} argument`, p);
