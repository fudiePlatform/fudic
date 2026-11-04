import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1203`; `file` is the `.fudspec`, `span` the step. */
export interface FUD1203Params extends FileInput {
  /** The reference as the step writes it. */
  readonly ref: string;
  /** How many elements it matched: more than one. */
  readonly count: number;
}

/** A step's reference matches more than one element (SDD-64). */
export const FUD1203 = (p: FUD1203Params): FileDiagnostic =>
  file('FUD1203', 'error', `"${p.ref}" matches ${p.count} elements: a step acts on one`, p);
