import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1081`. */
export type FUD1081Params = SourceInput & {
  readonly name: string;
  /** Its class: `type`, `form`, `rule`… */
  readonly what: string;
};

/** A project name declared twice (SDD-60). */
export const FUD1081 = (p: FUD1081Params): SourceDiagnostic =>
  source('FUD1081', 'error', `\`${p.name}\` is already a ${p.what} of the project`, p);
