import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1560`. */
export interface FUD1560Params extends SourceInput {
  /** The hook called: `afterHydrate`, `onConnect`… */
  readonly hook: string;
}

/** A lifecycle hook called anywhere but as a statement of its own at the top level of `@code` (SDD-86). */
export const FUD1560 = (p: FUD1560Params): SourceDiagnostic =>
  source(
    'FUD1560',
    'error',
    `${p.hook}(…) registers a lifecycle hook: call it as a statement at the top level of @code, not inside a function, a handler, a condition or a loop`,
    p,
  );
