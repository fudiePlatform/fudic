import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0591`. */
export interface FUD0591Params extends SourceInput {
  /** The form node expression, verbatim from the source. */
  readonly expression: string;
}

/** One form node bound by `control` to more than one element (SDD-34). */
export const FUD0591 = (p: FUD0591Params): SourceDiagnostic =>
  source(
    'FUD0591',
    'error',
    `\`${p.expression}\` is already bound to another element in this component: a form node binds one element, unless every one of them is an \`<input type="radio">\``,
    p,
  );
