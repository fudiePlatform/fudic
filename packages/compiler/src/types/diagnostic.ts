/**
 * `Diagnostic` — the error/warning object the parser EMITS instead of throwing (SDD-01 §3.2).
 *
 * Its home is `@fudic/diagnostics` (SDD-50): the compiler's `Diagnostic` is that package's
 * `SourceDiagnostic`, re-exported under the name the compiler has always used. Every one is
 * made by calling its code's function there, never by hand.
 */

import type { SourceDiagnostic } from '@fudic/diagnostics';

export type { Severity, RelatedLocation } from '@fudic/diagnostics';

/** A problem detected during parsing or analysis, at a span of the source. */
export type Diagnostic = SourceDiagnostic;
