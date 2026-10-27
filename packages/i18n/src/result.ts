import type { FudDiagnostic } from '@fudic/diagnostics/types';

/** `{ value, diagnostics }`: what every reader of this package returns instead of throwing. */
export interface ParseResult<T, D extends FudDiagnostic = FudDiagnostic> {
  readonly value: T;
  readonly diagnostics: readonly D[];
}
