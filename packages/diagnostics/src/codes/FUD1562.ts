import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1562`. */
export interface FUD1562Params extends SourceInput {
  /** The name declared or imported: `onConnect`, `afterHydrate`… */
  readonly name: string;
}

/** A declaration or an import of `@code` named like a lifecycle hook (SDD-86). */
export const FUD1562 = (p: FUD1562Params): SourceDiagnostic =>
  source(
    'FUD1562',
    'error',
    `${p.name} is a lifecycle hook of @code: a declaration or an import with that name hides it; rename it`,
    p,
  );
