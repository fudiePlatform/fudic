/**
 * Painting a diagnostic for a human. This is the ONLY place an offset becomes a line and a
 * column: diagnostics carry spans, and lines exist only on the way to someone's eyes.
 */

import { docsUrl } from './docs.js';
import { LineMap } from './linemap.js';
import type { Span } from './span.js';
import type { FudCode, FudDiagnostic, Severity } from './types.js';

/** A 1-based line and column, for humans (LSP positions stay 0-based in `LineMap`). */
export interface Place {
  readonly line: number;
  readonly column: number;
}

export interface Rendered {
  readonly severity: Severity;
  readonly code: FudCode;
  readonly message: string;
  /** The public explanation of the code. */
  readonly docs: string;
  readonly file?: string;
  /** Absent when the diagnostic has no span or no source text was given. */
  readonly start?: Place;
  readonly end?: Place;
  /** The offending line with the span underlined. Same condition as `start`. */
  readonly frame?: string;
}

/** Line, column and frame of a diagnostic, given the text of the file it points into. */
export function render(diagnostic: FudDiagnostic, source?: string): Rendered {
  const base = {
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    docs: docsUrl(diagnostic.code),
    ...(diagnostic.file !== undefined ? { file: diagnostic.file } : {}),
  };
  const at = diagnostic.span;
  if (at === undefined || source === undefined) {
    return base;
  }
  return { ...base, ...locate(source, at) };
}

/** Where a span is, for a human: 1-based start and end, and the frame. */
export interface Located {
  readonly start: Place;
  readonly end: Place;
  readonly frame: string;
}

/**
 * Line, column and frame of a span in a text.
 *
 * Exported for the problems that are not fudic's own — a TypeScript error over a `.fud`
 * (SDD-35) — so that they are painted by this same code and not by a second one.
 */
export function locate(source: string, at: Span): Located {
  const lines = new LineMap(source);
  const start = lines.positionAt(at.start);
  const end = lines.positionAt(at.end);
  return {
    start: { line: start.line + 1, column: start.character + 1 },
    end: { line: end.line + 1, column: end.character + 1 },
    frame: frame(source, lines, start.line, start.character, end.line === start.line ? end.character : undefined),
  };
}

/**
 * The line the span starts on, with a gutter and a `─` underline. A span that runs past its
 * first line is underlined to the end of that line: the first line is where the reader looks.
 */
function frame(
  source: string,
  lines: LineMap,
  line: number,
  from: number,
  to: number | undefined,
): string {
  const lineStart = lines.offsetAt({ line, character: 0 });
  const lineEnd = line + 1 < lines.lineCount ? lines.offsetAt({ line: line + 1, character: 0 }) : source.length;
  const text = source.slice(lineStart, lineEnd).replace(/\r?\n$|\r$/, '');
  const until = to ?? text.length;
  const gutter = String(line + 1);
  const pad = ' '.repeat(gutter.length);
  const width = Math.max(1, until - from);
  // `─` and not `~` or `^`: VS Code's terminal turns every WORD into a Ctrl+Click link, and a
  // word of tildes is a path to the home folder — it opened the user's home as a workspace
  // (SDD-35). `─` is one of the terminal's default word separators, so the underline is no
  // word at all and nothing to click.
  return `  ${gutter}  ${text}\n  ${pad}  ${' '.repeat(from)}${'─'.repeat(width)}`;
}

export interface FormatOptions {
  /** Absolute root the file path is shown relative to. */
  readonly root?: string;
  /** The text of the file the diagnostic points into, for line, column and frame. */
  readonly source?: string;
}

/**
 * The terminal text of a diagnostic:
 *
 *     src/routes/index.fud:12:15 - error FUD0050: message
 *
 *       12  <app-badge .tone="@(42)"></app-badge>
 *                      ────
 *
 *       http://…/diagnostic#FUD0050
 */
export function format(diagnostic: FudDiagnostic, options: FormatOptions = {}): string {
  const shown = render(diagnostic, options.source);
  const where = location(shown, options.root);
  const head = `${where}${shown.severity} ${shown.code}: ${shown.message}`;
  const parts = [head];
  if (shown.frame !== undefined) {
    parts.push('', shown.frame);
  }
  parts.push('', `  ${shown.docs}`);
  return parts.join('\n');
}

function location(shown: Rendered, root: string | undefined): string {
  if (shown.file === undefined) {
    return '';
  }
  const path = relative(shown.file, root);
  const at = shown.start !== undefined ? `:${shown.start.line}:${shown.start.column}` : '';
  return `${path}${at} - `;
}

/** POSIX path of `file` relative to `root`, or `file` itself when it is not under it. */
function relative(file: string, root: string | undefined): string {
  const posix = file.replace(/\\/g, '/');
  if (root === undefined) {
    return posix;
  }
  const base = root.replace(/\\/g, '/').replace(/\/$/, '');
  return posix.startsWith(`${base}/`) ? posix.slice(base.length + 1) : posix;
}
