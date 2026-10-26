import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1094`. */
export type FUD1094Params = SourceInput & {
  /** The value as written. */
  readonly value: string;
  /** The field's type, as written. */
  readonly type: string;
};

/** A form field whose initial value is not of its type (SDD-60). */
export const FUD1094 = (p: FUD1094Params): SourceDiagnostic =>
  source('FUD1094', 'error', `\`${p.value}\` is not a valid initial value for a \`${p.type}\` field`, p);
