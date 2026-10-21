import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1097`. */
export type FUD1097Params = SourceInput & {
  readonly rule: string;
  /** The clause it lacks: `on`, `runs` or `fails`. */
  readonly missing: string;
};

/** A `rule` without where it applies, where it runs or how it fails (SDD-60). */
export const FUD1097 = (p: FUD1097Params): SourceDiagnostic =>
  source('FUD1097', 'error', `rule \`${p.rule}\` needs \`${p.missing}\``, p);
