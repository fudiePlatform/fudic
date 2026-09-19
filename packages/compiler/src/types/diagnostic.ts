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
  /**
   * The file `span` belongs to, absolute. ABSENT means the file being compiled or opened,
   * which is the common case and the one nobody should have to state.
   *
   * It exists because a compilation can reach into a file the author did not ask about: a
   * `@snippet` body lives in the file that declares it, and an error inside it belongs there
   * and not at the `@render` that happened to pull it in (SDD-29 §5) — the call travels as a
   * `related` location instead, which is the link back.
   */
  readonly file?: string;
  /**
   * The OTHER places the problem is about (LSP `relatedInformation`).
   *
   * Some rules are about a pair and not about a point: two snippets that claim one name, a
   * parameter given twice, a body that fails inside the file that declares it because of the
   * call written in another. Putting the second location in the prose leaves the reader to
   * find it by hand; putting it here makes it a link in the editor and a second line in the
   * terminal.
   */
  readonly related?: readonly RelatedLocation[];
}

/** One secondary location of a diagnostic: where, in which file, and why it matters. */
export interface RelatedLocation {
  readonly span: Span;
  readonly message: string;
  /**
   * Absolute path of the file `span` belongs to. ABSENT means the file the diagnostic itself
   * is reported on — which is the common case and the one nobody should have to state.
   */
  readonly file?: string;
}

/** Construction helper with severity: 'error'. */
export function errorDiag(code: string, message: string, span: Span): Diagnostic {
  return { severity: 'error', code, message, span };
}

/** The same, with the second location the rule is about (`related`). */
export function relatedError(
  code: string,
  message: string,
  span: Span,
  related: readonly RelatedLocation[],
): Diagnostic {
  return { severity: 'error', code, message, span, related };
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
