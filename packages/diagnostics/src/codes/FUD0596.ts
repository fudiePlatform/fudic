import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0596`. */
export interface FUD0596Params extends SourceInput {
  /** The marker attribute written. */
  readonly name: 'error' | 'summary';
}

/** An `error=`/`summary=` value that is not a single `@` expression (SDD-34). */
export const FUD0596 = (p: FUD0596Params): SourceDiagnostic => {
  const example = p.name === 'error' ? 'error="@f.title"' : 'summary="@f"';
  return source(
    'FUD0596',
    'error',
    `${p.name} value must be a single \`@\` expression naming a form node, e.g. \`${example}\``,
    p,
  );
};
