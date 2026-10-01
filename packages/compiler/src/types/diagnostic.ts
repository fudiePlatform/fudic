/**
 * `Diagnostic` — the error/warning object the parser EMITS instead of throwing (SDD-01 §3.2).
 *
 * Its home is `@fudic/diagnostics` (SDD-50): the compiler's `Diagnostic` is that package's
 * `SourceDiagnostic`, re-exported under the name the compiler has always used. Every one is
 * made by calling its code's function there, never by hand.
 */

import type { FudCode, SourceDiagnostic } from '@fudic/diagnostics';
import type { RelatedLocation, Span } from '@fudic/diagnostics';

export type { Severity, RelatedLocation } from '@fudic/diagnostics';

/** A problem detected during parsing or analysis, at a span of the source. */
export type Diagnostic = SourceDiagnostic;

/** Construction helper with severity: 'error'. */
export function errorDiag(code: FudCode, message: string, span: Span): Diagnostic {
  return { severity: 'error', code, message, span };
}

/** The same, with the second location the rule is about (`related`). */
export function relatedError(
  code: FudCode,
  message: string,
  span: Span,
  related: readonly RelatedLocation[],
): Diagnostic {
  return { severity: 'error', code, message, span, related };
}

/** Construction helper with severity: 'warning'. */
export function warningDiag(code: FudCode, message: string, span: Span): Diagnostic {
  return { severity: 'warning', code, message, span };
}

/** Construction helper with severity: 'info'. */
export function infoDiag(code: FudCode, message: string, span: Span): Diagnostic {
  return { severity: 'info', code, message, span };
}

/** Construction helper with severity: 'hint'. */
export function hintDiag(code: FudCode, message: string, span: Span): Diagnostic {
  return { severity: 'hint', code, message, span };
}
