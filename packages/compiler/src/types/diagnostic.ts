/**
 * `Diagnostic` — the error/warning object the parser EMITS instead of throwing
 * (SDD-01 §3.2). Every Diagnostic carries a span: an error without a location is
 * not actionable in a language server.
 */

import type { Span } from './span.js';

/**
 * The four LSP severities (DiagnosticSeverity: Error/Warning/Information/Hint).
 * Faithful to the protocol from the start so the exhaustive switches in SDD-12+
 * never need to be widened later (a non-additive change if 'hint' were deferred).
 */
export type Severity = 'error' | 'warning' | 'info' | 'hint';

/**
 * A problem detected during parsing or analysis. The parser EMITS diagnostics,
 * it never throws (golden rule of the INDEX). Every Diagnostic carries a span:
 * an error without a location is not actionable in a language server.
 */
export interface Diagnostic {
  readonly severity: Severity;
  /** Stable, readable code. Convention: "FUD" + number. E.g. "FUD0001". */
  readonly code: string;
  /** Human-readable message, single line, no trailing period. */
  readonly message: string;
  /** Location in the source. Required. */
  readonly span: Span;
}

/** Construction helper with severity: 'error'. */
export function errorDiag(code: string, message: string, span: Span): Diagnostic {
  return { severity: 'error', code, message, span };
}

/** Construction helper with severity: 'warning'. */
export function warningDiag(code: string, message: string, span: Span): Diagnostic {
  return { severity: 'warning', code, message, span };
}

/** Construction helper with severity: 'info'. */
export function infoDiag(code: string, message: string, span: Span): Diagnostic {
  return { severity: 'info', code, message, span };
}

/** Construction helper with severity: 'hint'. */
export function hintDiag(code: string, message: string, span: Span): Diagnostic {
  return { severity: 'hint', code, message, span };
}
