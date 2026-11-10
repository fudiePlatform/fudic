import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1507`. */
export interface FUD1507Params extends SourceInput {
  readonly fn: string;
  /** The first segment of the field, the argument it names. */
  readonly field: string;
  /** The arguments of the function. */
  readonly args: readonly string[];
}

/** `sent` with a field that is not an argument of the function (`.fudspec`) (SDD-82). */
export const FUD1507 = (p: FUD1507Params): SourceDiagnostic =>
  source('FUD1507', 'error', `\`${p.field}\` is not an argument of \`${p.fn}\`; arguments: [${p.args.join(', ')}]`, p);
