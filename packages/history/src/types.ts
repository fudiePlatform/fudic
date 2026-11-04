import type { SourceDiagnostic, Span } from '@fudic/diagnostics';

/** One thing that happened to a piece. */
export type HistoryEvent =
  | { readonly kind: 'started'; readonly by: string; readonly text: string }
  | { readonly kind: 'approved'; readonly by: string; readonly criteria: number; readonly hash: string }
  | {
      readonly kind: 'tests';
      readonly verdict: 'pass' | 'red' | 'broken';
      readonly passed: number;
      readonly total: number;
      readonly hash: string;
    }
  | {
      readonly kind: 'spec_run';
      readonly verdict: 'pass' | 'fail' | 'error';
      readonly passed: number;
      readonly total: number;
      readonly hash: string;
      readonly failing: readonly string[];
    }
  | { readonly kind: 'documented'; readonly documented: number; readonly props: number }
  | { readonly kind: 'look'; readonly by: string; readonly hash: string }
  | { readonly kind: 'reopened'; readonly by: string; readonly text: string }
  | { readonly kind: 'done' }
  | { readonly kind: 'accepted'; readonly by: string; readonly text: string; readonly tag: string }
  | { readonly kind: 'connected'; readonly functions: readonly string[] };

export type HistoryKind = HistoryEvent['kind'];

/** One line of a `.fudlog`. */
export interface HistoryLine {
  /** UTC to the minute: `2026-10-22T10:02Z`. */
  readonly at: string;
  /** The first seven characters of `HEAD` when written, or `-------` outside git. */
  readonly commit: string;
  readonly event: HistoryEvent;
  /** The line in the `.fudlog`, without its line ending. */
  readonly span: Span;
}

/** What a reader always returns: what it could read, and what it could not. */
export interface ParseResult<T> {
  readonly value: T;
  readonly diagnostics: readonly SourceDiagnostic[];
}

/** The commit of a line written outside git or before the first commit. */
export const NO_COMMIT = '-------';
