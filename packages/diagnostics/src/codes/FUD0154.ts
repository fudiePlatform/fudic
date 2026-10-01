import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0154`. */
export interface FUD0154Params extends SourceInput {
  /** The role of the file: a component, a route, or a page/layout document. */
  readonly role: 'component' | 'route' | 'document';
}

/** More than one `@code` block in one file (SDD-10). */
export const FUD0154 = (p: FUD0154Params): SourceDiagnostic =>
  source('FUD0154', 'error', `A ${p.role} has at most one @code block`, p);
