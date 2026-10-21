import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1082`. */
export type FUD1082Params = SourceInput & {
  readonly name: string;
  /** Where it repeats: `file`, `type Person`, `get search`… */
  readonly where: string;
};

/** A name repeated in one file or one block (SDD-60). */
export const FUD1082 = (p: FUD1082Params): SourceDiagnostic =>
  source('FUD1082', 'error', `\`${p.name}\` is repeated in this ${p.where}`, p);
