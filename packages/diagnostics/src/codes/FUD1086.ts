import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1086`. */
export type FUD1086Params = SourceInput & {
  readonly middleware: string;
};

/** A `skip` of a middleware the level does not inherit (SDD-60). */
export const FUD1086 = (p: FUD1086Params): SourceDiagnostic =>
  source('FUD1086', 'error', `\`${p.middleware}\` is not inherited here: there is nothing to skip`, p);
