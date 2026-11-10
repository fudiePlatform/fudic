import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1515`. */
export type FUD1515Params = FileInput & {
  /** Where the value was going: `data.entrar-como-ana.users.0.created`. */
  readonly at: string;
  /** What it is: `a function`, `a Map`, `a cycle`. */
  readonly found: string;
};

/** `record`: a value that cannot be written as a literal, not recorded (SDD-82). */
export const FUD1515 = (p: FUD1515Params): FileDiagnostic =>
  file('FUD1515', 'warning', `\`${p.at}\` is ${p.found} and cannot be written as a literal: not recorded`, p);
