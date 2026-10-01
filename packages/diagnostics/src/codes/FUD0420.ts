import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0420`. */
export interface FUD0420Params extends SourceInput {
  /** A route (top level) or a page/layout document (its `<head>`). */
  readonly role: 'route' | 'document';
}

/** More than one `<link rel="layout">` in one file (SDD-21). */
export const FUD0420 = (p: FUD0420Params): SourceDiagnostic =>
  source(
    'FUD0420',
    'error',
    p.role === 'route' ? 'A route declares exactly one layout' : 'A document declares at most one layout',
    p,
  );
