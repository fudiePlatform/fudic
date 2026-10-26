import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1098`. */
export type FUD1098Params = SourceInput & {
  readonly rule: string;
  /** What the rule checks: `field`, `group` or `form`. */
  readonly target: string;
  /** Where it was used: `a field`, `a group summary`, `a form summary`. */
  readonly place: string;
};

/** A rule used where its kind does not go (SDD-60). */
export const FUD1098 = (p: FUD1098Params): SourceDiagnostic =>
  source('FUD1098', 'error', `rule \`${p.rule}\` checks a ${p.target} and cannot go in ${p.place}`, p);
