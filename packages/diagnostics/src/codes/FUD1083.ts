import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1083`. */
export type FUD1083Params = SourceInput & {
  readonly rule: string;
  /** The type of the field, as written. */
  readonly type: string;
  /** The types its `on field` takes, as written. */
  readonly accepts: readonly string[];
};

/** A rule under a field whose type it does not apply to (SDD-60). */
export const FUD1083 = (p: FUD1083Params): SourceDiagnostic =>
  source(
    'FUD1083',
    'error',
    `rule \`${p.rule}\` does not apply to a \`${p.type}\` field: it takes ${p.accepts.map((t) => `\`${t}\``).join(', ')}`,
    p,
  );
