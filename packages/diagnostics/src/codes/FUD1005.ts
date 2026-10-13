import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1005`. */
export type FUD1005Params = SourceInput & {
  /** The name written in `form:=`. */
  readonly name: string;
};

/** `form:=` naming something that is not a server function of the file (SDD-56). */
export const FUD1005 = (p: FUD1005Params): SourceDiagnostic =>
  source('FUD1005', 'error', `\`form:=\` sends the form to a server function of this file, and \`${p.name}\` is not one`, p);
