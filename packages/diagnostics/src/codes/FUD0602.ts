import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0602`. */
export interface FUD0602Params extends SourceInput {
  /** The tag name of the element carrying `summary=`, as written. */
  readonly element: string;
}

/** `summary=` on an element that cannot hold the list the runtime writes (BUG-42). */
export const FUD0602 = (p: FUD0602Params): SourceDiagnostic =>
  source(
    'FUD0602',
    'error',
    `a summary is a list, and a \`<${p.element}>\` cannot hold one: mark a \`<div>\` or a \`<section>\``,
    p,
  );
