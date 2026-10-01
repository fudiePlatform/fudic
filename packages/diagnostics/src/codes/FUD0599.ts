import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0599`. */
export interface FUD0599Params extends SourceInput {
  /** The marker attribute: `error` or `summary`. */
  readonly attr: string;
}

/** A marker with content, or with an `id` that is not static (BUG-41). */
export const FUD0599 = (p: FUD0599Params): SourceDiagnostic =>
  source(
    'FUD0599',
    'error',
    `a \`${p.attr}\` marker must be empty and, if it has an \`id\`, a static one: the runtime writes its content, and \`aria-describedby\` has to name it`,
    p,
  );
