/**
 * One physical line of a `.fudspec`, cut into its indentation, its tokens and its comment.
 *
 * A token is a run of non-blank characters in which a `"…"` section may hold blanks. A `#`
 * that starts a token starts a comment to the end of the line; anywhere else, and inside
 * quotes, it is an ordinary character. Inside quotes `\"` and `\\` are escapes and any other
 * backslash is itself. A string never crosses a line.
 *
 * The cut never fails: an unclosed quote ends at the end of the line and is reported.
 */

import { FUD0920, span, type SourceDiagnostic, type Span } from '@fudic/diagnostics';

/** A quoted section inside a token, quotes included in `span`. */
export interface Quoted {
  readonly span: Span;
  /** The unescaped content. */
  readonly text: string;
  readonly closed: boolean;
}

export interface Token {
  readonly span: Span;
  /** The token exactly as written. */
  readonly raw: string;
  readonly quoted: readonly Quoted[];
}

export interface Line {
  /** Width of the leading blanks, in characters. */
  readonly indent: number;
  /** The leading blanks, for a diagnostic about them. */
  readonly indentSpan: Span;
  /** A tab among the leading blanks: never a valid indentation. */
  readonly tabbed: boolean;
  readonly tokens: readonly Token[];
  readonly comment?: Span;
}

const isBlank = (c: string | undefined): boolean => c === ' ' || c === '\t';

/** Cut `source[start, end)` — one line without its terminator — and report into `out`. */
export function readLine(source: string, start: number, end: number, out: SourceDiagnostic[]): Line {
  let i = start;
  let tabbed = false;
  while (i < end && isBlank(source[i])) {
    if (source[i] === '\t') tabbed = true;
    i++;
  }
  const indentSpan = span(start, i);

  const tokens: Token[] = [];
  let comment: Span | undefined;
  while (i < end) {
    if (isBlank(source[i])) {
      i++;
      continue;
    }
    if (source[i] === '#') {
      comment = span(i, end);
      break;
    }
    const tokenStart = i;
    const quoted: Quoted[] = [];
    while (i < end && !isBlank(source[i])) {
      if (source[i] === '"') {
        const q = readQuoted(source, i, end);
        if (!q.closed) out.push(FUD0920({ span: q.span }));
        quoted.push(q);
        i = q.span.end;
      } else {
        i++;
      }
    }
    tokens.push({ span: span(tokenStart, i), raw: source.slice(tokenStart, i), quoted });
  }

  return {
    indent: indentSpan.end - indentSpan.start,
    indentSpan,
    tabbed,
    tokens,
    ...(comment !== undefined ? { comment } : {}),
  };
}

/** A quoted section starting at the `"` at `open`. */
function readQuoted(source: string, open: number, end: number): Quoted {
  let text = '';
  let i = open + 1;
  while (i < end) {
    const c = source[i] as string;
    if (c === '"') return { span: span(open, i + 1), text, closed: true };
    const next = source[i + 1];
    if (c === '\\' && i + 1 < end && (next === '"' || next === '\\')) {
      text += next;
      i += 2;
    } else {
      text += c;
      i++;
    }
  }
  return { span: span(open, end), text, closed: false };
}
