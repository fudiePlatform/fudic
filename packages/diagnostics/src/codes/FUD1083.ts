import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1083`. */
export type FUD1083Params = SourceInput & {
  readonly rule: string;
  /** The type of the field or the argument, as written. */
  readonly type: string;
  /** The types its `on field` takes, as written. */
  readonly accepts: readonly string[];
  /** What the rule is under. Default `field`. */
  readonly under?: 'field' | 'argument';
};

/** A rule under a field or an argument whose type it does not apply to (SDD-60, SDD-67). */
export const FUD1083 = (p: FUD1083Params): SourceDiagnostic =>
  source(
    'FUD1083',
    'error',
    `rule \`${p.rule}\` does not apply to a \`${p.type}\` ${p.under ?? 'field'}: it takes ${p.accepts.map((t) => `\`${t}\``).join(', ')}`,
    p,
  );
