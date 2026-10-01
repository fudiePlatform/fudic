import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0895`. */
export interface FUD0895Params extends SourceInput {
  /** `@( … )` followed by more, or a bare `@` followed by more than a path. */
  readonly form: 'group' | 'path';
}

/** A `@render` argument whose `@` is followed by more than a path or a group (SDD-48). */
export const FUD0895 = (p: FUD0895Params): SourceDiagnostic =>
  source(
    'FUD0895',
    'error',
    p.form === 'group'
      ? 'an argument written `@( … )` is that group and nothing after it'
      : 'an argument after a bare `@` is a name or a path: wrap anything else in `@( … )`',
    p,
  );
