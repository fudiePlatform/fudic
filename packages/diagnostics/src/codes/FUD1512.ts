import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1512`. */
export interface FUD1512Params extends SourceInput {
  readonly name: string;
}

/** `as <name>` with a name that is also a term (`.fudspec`) (SDD-82). */
export const FUD1512 = (p: FUD1512Params): SourceDiagnostic =>
  source('FUD1512', 'error', `\`${p.name}\` is a term: give the person another name`, p);
