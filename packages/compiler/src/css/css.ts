/**
 * The body of a `<style>`: plain CSS (decision 136, SDD-49 §4.12). Parses it into a
 * `StyleNode` of ONE literal run.
 *
 * It used to be CSS with Razor (decision 42, revoked): expressions, comments and the `@@`
 * escape lived between the CSS runs. They are gone, and writing one is an error, `FUD0132`:
 * an `@` inside `<style>` is only CSS in front of an at-rule of the closed list or of a
 * vendor prefix (`@-webkit-…`), or inside a string or a CSS comment. Everything dynamic about
 * a style is written in the markup — `style=`, `style:`, `class:` — which is still Razor.
 *
 * Two jobs, and only two:
 *  1. Report every `@` that is not CSS (`FUD0132`).
 *  2. Count `{`/`}` outside comments and strings to validate nesting (`FUD0131`).
 *
 * It does NOT build a rule tree (that is `rules.ts`, for plain sheets) and never throws: the
 * text marked with `FUD0132` stays in the run, and the cursor always advances.
 */

import { type Span, span, emptySpan } from '../types/index.js';
import type { Diagnostic } from '../types/index.js';
import { FUD0131, FUD0132 } from '@fudic/diagnostics';
import { type ParseResult, ok, withDiagnostics } from '../types/index.js';
import { scanParens } from '../balancer/index.js';
import type { StyleNode } from './nodes.js';
import { atRuleNameEnd, isCssAtRule } from './atrules.js';

/** An identifier start, after an `@`: what used to open a Razor expression or construct. */
const IDENT_START = /[\p{ID_Start}$_]/u;
const IDENT_PART = /[\p{ID_Continue}$‌‍]/u;

/** LF, CR, LINE SEPARATOR, PARAGRAPH SEPARATOR — a CSS string may not span one. */
const LINE_TERMINATORS: ReadonlySet<number> = new Set([0x0a, 0x0d, 0x2028, 0x2029]);

function isLineTerminator(c: string): boolean {
  return LINE_TERMINATORS.has(c.charCodeAt(0));
}

/**
 * Scans one `<style>` body. Stateful cursor, one instance per `parseStyle` call: the public
 * API stays a pure function.
 *
 * The scanner reads a source TRUNCATED at the end of the body, so offsets stay absolute and
 * nothing it does can reach past `</style>`.
 */
class StyleScanner {
  /** Source truncated at `#end`; offsets are absolute in the original file. */
  readonly #source: string;
  readonly #start: number;
  readonly #end: number;
  readonly #diagnostics: Diagnostic[] = [];

  /** Cursor. */
  #i: number;
  /** Nesting depth of `{ }` outside comments and strings. */
  #depth = 0;

  constructor(source: string, body: Span) {
    // Clamp: a caller that hands a body span past the end of the file gets an empty scan
    // rather than an exception.
    this.#end = Math.min(body.end, source.length);
    this.#start = Math.min(body.start, this.#end);
    this.#source = source.slice(0, this.#end);
    this.#i = this.#start;
  }

  scan(): ParseResult<StyleNode> {
    while (this.#i < this.#end) {
      switch (this.#source[this.#i]) {
        case '/':
          this.#scanMaybeComment();
          break;
        case '"':
        case "'":
          this.#scanString(this.#source[this.#i]!);
          break;
        case '@':
          this.#scanAt();
          break;
        case '{':
          this.#depth++;
          this.#i++;
          break;
        case '}':
          this.#closeBrace();
          break;
        default:
          this.#i++;
      }
    }

    if (this.#depth > 0) {
      this.#diagnostics.push(
        FUD0131({ span: emptySpan(this.#end), kind: 'unclosed', blocks: this.#depth }),
      );
    }

    const node: StyleNode = {
      type: 'style-content',
      span: span(this.#start, this.#end),
      parts:
        this.#end > this.#start
          ? [
              {
                type: 'css-text',
                span: span(this.#start, this.#end),
                value: this.#source.slice(this.#start, this.#end),
              },
            ]
          : [],
    };
    return this.#diagnostics.length === 0 ? ok(node) : withDiagnostics(node, this.#diagnostics);
  }

  /** A CSS comment `/* … *\/`: an `@` inside it is text, and its braces do not count. */
  #scanMaybeComment(): void {
    if (this.#source[this.#i + 1] !== '*') {
      this.#i++;
      return;
    }
    const close = this.#source.indexOf('*/', this.#i + 2);
    this.#i = close === -1 ? this.#end : Math.min(close + 2, this.#end);
  }

  /**
   * A CSS string: an `@` inside it is text, and its braces do not count. Terminated by the
   * matching quote or, like CSS itself, by an unescaped line terminator.
   */
  #scanString(quote: string): void {
    this.#i++;
    while (this.#i < this.#end) {
      const c = this.#source[this.#i]!;
      if (c === '\\') {
        this.#i += 2;
        continue;
      }
      this.#i++;
      if (c === quote || isLineTerminator(c)) return;
    }
  }

  /** A `}` with no open block is reported where it occurs, and the depth stays at 0. */
  #closeBrace(): void {
    if (this.#depth === 0) {
      this.#diagnostics.push(FUD0131({ span: emptySpan(this.#i), kind: 'unmatched' }));
    } else {
      this.#depth--;
    }
    this.#i++;
  }

  /** `FUD0132` over `[from, to)`, and the scan resumes at `to`. */
  #razor(from: number, to: number): void {
    this.#diagnostics.push(FUD0132({ span: span(from, to) }));
    this.#i = to;
  }

  /** An `@`: CSS when it opens an at-rule of the list or a vendor one; `FUD0132` otherwise. */
  #scanAt(): void {
    const at = this.#i;
    const next = this.#source[at + 1];

    // `@-webkit-keyframes`: a vendor at-rule, CSS.
    if (next === '-') {
      this.#i = at + 1;
      return;
    }
    const nameEnd = atRuleNameEnd(this.#source, at + 1);
    if (nameEnd > at + 1 && isCssAtRule(this.#source.slice(at + 1, nameEnd))) {
      this.#i = nameEnd;
      return;
    }

    // Everything else is Razor that is no longer there: the whole construct when it can be
    // delimited, and the `@` with what follows it when it cannot.
    if (next === '@') return this.#razor(at, at + 2);
    if (next === '*') {
      const close = this.#source.indexOf('*@', at + 2);
      return this.#razor(at, close === -1 ? this.#end : Math.min(close + 2, this.#end));
    }
    if (next === '(') {
      const end = Math.min(scanParens(this.#source, at + 1).value.span.end, this.#end);
      return this.#razor(at, Math.max(end, at + 2));
    }
    if (next !== undefined && IDENT_START.test(next)) {
      let i = at + 2;
      while (i < this.#end && IDENT_PART.test(this.#source[i]!)) i++;
      return this.#razor(at, i);
    }
    this.#razor(at, at + 1);
  }
}

/**
 * Parse a `<style>` body into a `StyleNode` of one CSS run. `body` is the span of the content
 * between the start tag's `>` and `</style>`. Never throws.
 */
export function parseStyle(source: string, body: Span): ParseResult<StyleNode> {
  return new StyleScanner(source, body).scan();
}
