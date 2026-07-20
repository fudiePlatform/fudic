/**
 * CSS with Razor (SDD-09). Parses the body of a `<style>` element into a flat
 * `StyleNode`: literal CSS runs interleaved with Razor atoms.
 *
 * Two jobs, and only two:
 *  1. Disambiguate every `@` (decision 42) via the closed at-rule whitelist.
 *  2. Count `{`/`}` outside comments and strings to validate nesting (42.e).
 *
 * It does NOT build a CSS rule tree, does not scope the sheet (emit, SDD-15) and
 * does not validate the JS of an expression (Oxc, SDD-11). It never throws: bad
 * input yields a degraded value plus located diagnostics, and the cursor always
 * advances.
 */

import { type Span, span, emptySpan } from '../types/index.js';
import { type Diagnostic, errorDiag } from '../types/index.js';
import { type ParseResult, ok, withDiagnostics } from '../types/index.js';
import { resolveTrigger } from '../at/index.js';
import type { RazorExpression } from '../at/index.js';
import { scanParens } from '../balancer/index.js';
import type { CssPart, StyleNode } from './nodes.js';
import { atRuleNameEnd, isCssAtRule } from './atrules.js';

/** A JS identifier start: gate for handing an `@ident` over to `resolveTrigger`. */
const JS_IDENT_START = /[\p{ID_Start}$_]/u;

/** LF, CR, LINE SEPARATOR, PARAGRAPH SEPARATOR — a CSS string may not span one. */
const LINE_TERMINATORS: ReadonlySet<number> = new Set([0x0a, 0x0d, 0x2028, 0x2029]);

function isLineTerminator(c: string): boolean {
  return LINE_TERMINATORS.has(c.charCodeAt(0));
}

/**
 * Scans one `<style>` body. Stateful cursor, one instance per `parseStyle` call:
 * the public API stays a pure function.
 *
 * The scanner reads a source TRUNCATED at the end of the body (`source.slice(0,
 * body.end)`). Truncating from offset 0 keeps every offset absolute — no span
 * arithmetic anywhere — while making it impossible for an unterminated `@( ... )`
 * to swallow the `</style>` close tag and the rest of the file. That is what keeps
 * the "parts tile the body" invariant (§5) true even on broken input.
 */
class StyleScanner {
  /** Source truncated at `#end`; offsets are absolute in the original file. */
  readonly #source: string;
  readonly #start: number;
  readonly #end: number;
  readonly #parts: CssPart[] = [];
  readonly #diagnostics: Diagnostic[] = [];

  /** Start of the literal CSS run being accumulated; flushed by `#flush`. */
  #textStart: number;
  /** Cursor. */
  #i: number;
  /** Nesting depth of `{ }` outside comments and strings (42.e). */
  #depth = 0;

  constructor(source: string, body: Span) {
    // Clamp: a caller that hands a body span past the end of the file gets an
    // empty scan rather than an exception.
    this.#end = Math.min(body.end, source.length);
    this.#start = Math.min(body.start, this.#end);
    this.#source = source.slice(0, this.#end);
    this.#textStart = this.#start;
    this.#i = this.#start;
  }

  scan(): ParseResult<StyleNode> {
    while (this.#i < this.#end) {
      const c = this.#source[this.#i];
      /* c8 ignore next -- unreachable: #i < #end guarantees a character */
      if (c === undefined) break;

      switch (c) {
        case '/':
          this.#scanMaybeComment();
          break;
        case '"':
        case "'":
          this.#scanString(c);
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

    this.#flush(this.#end);

    if (this.#depth > 0) {
      this.#error(
        'FUD0131',
        `Unbalanced CSS braces in <style>: ${this.#depth} block(s) left unclosed`,
        emptySpan(this.#end),
      );
    }

    const node: StyleNode = {
      type: 'style-content',
      span: span(this.#start, this.#end),
      parts: this.#parts,
    };
    return this.#diagnostics.length === 0 ? ok(node) : withDiagnostics(node, this.#diagnostics);
  }

  // ------------------------------------------------------------------
  // Part accumulation
  // ------------------------------------------------------------------

  /** Close the pending literal run at `at`. Empty runs produce no node. */
  #flush(at: number): void {
    if (at > this.#textStart) {
      this.#parts.push({
        type: 'css-text',
        span: span(this.#textStart, at),
        value: this.#source.slice(this.#textStart, at),
      });
    }
    this.#textStart = at;
  }

  /** Emit a non-text part covering [from, to) and resume the literal run at `to`. */
  #part(part: CssPart, to: number): void {
    this.#flush(part.span.start);
    this.#parts.push(part);
    this.#textStart = to;
    this.#i = to;
  }

  #error(code: string, message: string, at: Span): void {
    this.#diagnostics.push(errorDiag(code, message, at));
  }

  // ------------------------------------------------------------------
  // Opaque runs: comments and strings
  // ------------------------------------------------------------------

  /**
   * A CSS comment `/* ... *\/` is the ONE zone where `@` is inert (§4.1): an
   * `@media` or an `@name` inside it is literal text. It is absorbed into the
   * current literal run, so its braces never reach the counter either.
   *
   * A lone `/` is just a character. An unterminated comment runs to the end of
   * the body without a diagnostic: the browser tolerates it and SDD-09 reserves
   * no code for it.
   */
  #scanMaybeComment(): void {
    if (this.#source[this.#i + 1] !== '*') {
      this.#i++;
      return;
    }
    const close = this.#source.indexOf('*/', this.#i + 2);
    this.#i = close === -1 ? this.#end : Math.min(close + 2, this.#end);
  }

  /**
   * A CSS string. Razor interpolation stays ACTIVE inside it (§8, option A), so
   * this does not absorb the run: it walks it keeping `@` live while making sure
   * a `{` or `}` in the string never reaches the brace counter.
   *
   * Terminated by the matching quote, or — like CSS itself — by an unescaped line
   * terminator. Neither case is a diagnostic here: the browser judges the CSS.
   */
  #scanString(quote: string): void {
    this.#i++;
    while (this.#i < this.#end) {
      const c = this.#source[this.#i];
      /* c8 ignore next -- unreachable: #i < #end guarantees a character */
      if (c === undefined) return;
      if (c === '\\') {
        this.#i += 2;
        continue;
      }
      if (c === quote || isLineTerminator(c)) {
        this.#i++;
        return;
      }
      if (c === '@') {
        this.#scanAt();
        continue;
      }
      this.#i++;
    }
  }

  // ------------------------------------------------------------------
  // Braces (decision 42.e)
  // ------------------------------------------------------------------

  /**
   * A `}` with no open block is reported where it occurs rather than being
   * folded into a single end-of-body count: the offset of the stray brace is the
   * actionable location, and clamping the depth at 0 keeps the rest of the body
   * scanning normally.
   */
  #closeBrace(): void {
    if (this.#depth === 0) {
      this.#error('FUD0131', 'Unbalanced CSS braces in <style>: unmatched }', emptySpan(this.#i));
    } else {
      this.#depth--;
    }
    this.#i++;
  }

  // ------------------------------------------------------------------
  // The `@` disambiguation (decision 42)
  // ------------------------------------------------------------------

  #scanAt(): void {
    const at = this.#i;
    const next = this.#source[at + 1];

    // `@@` => a literal `@` in the output (42.c).
    if (next === '@') {
      this.#part({ type: 'at-escape', span: span(at, at + 2) }, at + 2);
      return;
    }

    // `@* ... *@` => a Razor comment: kept for spans, never emitted (decision 37).
    if (next === '*') {
      this.#scanRazorComment(at);
      return;
    }

    // `@( ... )` => an explicit expression. The balancer owns the boundary.
    if (next === '(') {
      this.#scanExplicit(at);
      return;
    }

    // Whitelisted at-rule => literal CSS. Razor stays live in prelude and body
    // (42.d), which is exactly what "keep scanning" means here.
    const nameEnd = atRuleNameEnd(this.#source, at + 1);
    if (nameEnd > at + 1 && isCssAtRule(this.#source.slice(at + 1, nameEnd))) {
      this.#i = nameEnd;
      return;
    }

    // `@` + JS identifier => a Razor trigger. Anything else (whitespace, symbol,
    // end of body) is literal text; the browser judges it.
    const identStart = this.#source[at + 1];
    if (identStart === undefined || !JS_IDENT_START.test(identStart)) {
      this.#i = at + 1;
      return;
    }
    this.#scanTrigger(at);
  }

  #scanRazorComment(at: number): void {
    const close = this.#source.indexOf('*@', at + 2);
    if (close === -1) {
      // Same code the lexer uses for the same mistake (SDD-03): a code is a
      // meaning, not a producer, so it is reused rather than renumbered.
      this.#error('FUD0011', 'Unterminated Razor comment', emptySpan(this.#end));
      this.#part({ type: 'razor-comment', span: span(at, this.#end) }, this.#end);
      return;
    }
    const end = Math.min(close + 2, this.#end);
    this.#part({ type: 'razor-comment', span: span(at, end) }, end);
  }

  #scanExplicit(at: number): void {
    const group = scanParens(this.#source, at + 1);
    this.#diagnostics.push(...group.diagnostics);
    const expression: RazorExpression = {
      type: 'razor-expression',
      kind: 'explicit',
      span: span(at, group.value.span.end),
      expr: group.value.inner,
      regions: group.value.regions,
    };
    this.#part(expression, expression.span.end);
  }

  /**
   * `@` + identifier, already known not to be a whitelisted at-rule. SDD-04
   * decides what it is; only an implicit expression survives in v1.
   *
   * Control flow, `@code` and `@raw` are out of scope inside `<style>` (§4.4):
   * they degrade to FUD0130, the `@keyword` is emitted as literal text and the
   * scan resumes right after it — so `@if (x) { ... }` still contributes its
   * braces to the balance check instead of derailing it.
   */
  #scanTrigger(at: number): void {
    const resolved = resolveTrigger(this.#source, at);
    const resolution = resolved.value;

    if (resolution.kind === 'implicit') {
      const expression = resolution.expression;
      this.#diagnostics.push(...resolved.diagnostics);
      this.#part(expression, expression.span.end);
      return;
    }

    // The keyword span never includes the `@`, so the literal text left behind
    // is `@if`, `@code`, `@raw`. Diagnostics from the rejected construct's own
    // scan (e.g. the parens of `@raw(`) are dropped: it is not being parsed.
    const keywordSpan = resolution.keywordSpan;
    const keyword = this.#source.slice(keywordSpan.start, keywordSpan.end);
    this.#error(
      'FUD0130',
      `Razor construct @${keyword} is not allowed inside <style> in v1`,
      span(at, keywordSpan.end),
    );
    this.#i = keywordSpan.end;
  }
}

/**
 * Parse a `<style>` body into a `StyleNode`. `body` is the span of the content
 * between the start tag's `>` and `</style>` — exactly the span SDD-05 already
 * stores on the `RawTextNode` child of a `<style>` element, so this pass can run
 * over an existing HTML tree with no change to SDD-03/05.
 *
 * Never throws.
 */
export function parseStyle(source: string, body: Span): ParseResult<StyleNode> {
  return new StyleScanner(source, body).scan();
}
