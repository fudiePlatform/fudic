import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1514`. */
export type FUD1514Params = FileInput & {
  readonly fn: string;
  /** What the fixture answers with: `a file`, `a value`. */
  readonly answered: string;
  /** What the function returns: `a file`, `a value`. */
  readonly returns: string;
};

/** The workbench: a fixture answers a function with the wrong kind of value (SDD-82). */
export const FUD1514 = (p: FUD1514Params): FileDiagnostic =>
  file('FUD1514', 'error', `the fixture answers \`${p.fn}\` with ${p.answered}, and it returns ${p.returns}`, p);
