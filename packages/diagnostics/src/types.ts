/**
 * The shapes every fudic diagnostic takes. There are three, because there are three kinds of
 * place a problem can be: a range in a source file, a file as a whole, or nowhere in particular
 * (a command line, a project). Each code picks one in its signature and never changes it.
 */

import type { Span } from './span.js';

/**
 * The four LSP severities (DiagnosticSeverity: Error/Warning/Information/Hint). The severity
 * belongs to the code, never to the call: a code that needs two severities is two codes.
 */
export type Severity = 'error' | 'warning' | 'info' | 'hint';

/** `FUD` + four digits. E.g. `FUD0050`. */
export type FudCode = `FUD${number}`;

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

interface DiagnosticBase {
  readonly severity: Severity;
  readonly code: FudCode;
  /** English, single line, no trailing period. Composed by the code's own function. */
  readonly message: string;
}

/**
 * A problem at a place in a source file: what the compiler and the editor report. The span is
 * REQUIRED — an error without a location is not actionable in a language server.
 */
export interface SourceDiagnostic extends DiagnosticBase {
  readonly span: Span;
  /**
   * The file `span` belongs to, absolute. ABSENT means the file being compiled or opened,
   * which is the common case and the one nobody should have to state.
   *
   * It exists because a compilation can reach into a file the author did not ask about: a
   * `@snippet` body lives in the file that declares it, and an error inside it belongs there
   * and not at the `@render` that happened to pull it in — the call travels as a `related`
   * location instead, which is the link back.
   */
  readonly file?: string;
  /**
   * The OTHER places the problem is about (LSP `relatedInformation`): two snippets that claim
   * one name, a parameter given twice, a body that fails because of a call written elsewhere.
   */
  readonly related?: readonly RelatedLocation[];
}

/** A problem about a file, maybe at a place in it: what the build and `fudic.json` report. */
export interface FileDiagnostic extends DiagnosticBase {
  readonly file: string;
  readonly span?: Span;
}

/** A problem about the project or the command line: there is no file to point at. */
export interface ProjectDiagnostic extends DiagnosticBase {
  readonly file?: never;
  readonly span?: never;
}

export type FudDiagnostic = SourceDiagnostic | FileDiagnostic | ProjectDiagnostic;

/** What every source-located code receives, plus the data its message needs. */
export interface SourceInput {
  readonly span: Span;
  readonly file?: string;
  readonly related?: readonly RelatedLocation[];
}

/** What every file-located code receives, plus the data its message needs. */
export interface FileInput {
  readonly file: string;
  readonly span?: Span;
}
