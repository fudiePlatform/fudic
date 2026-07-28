/**
 * The layout-directive parser (SDD-21). It implements SDD-05's
 * `AtConstructParser.parseDirective`: SDD-05 resolves an `@` to a layout directive
 * (SDD-04) and hands the parse over here; this module reads the mandatory `( … )` with
 * the balancer (SDD-02) and, for `@section`, fills the `{ … }` body by recursing back
 * through `ctx.parseContentUntil` — the same seam SDD-06 uses.
 *
 * SDD-21 owns the Razor punctuation only: `(`, `)`, the section name, `{`, `}`. It does
 * NOT decide whether the directive is allowed here: `@RenderBody()` in a component and
 * `@section` in a layout are wrong, but that is a question about the ROLE of the
 * document, which only SDD-10's structuring pass knows (SDD-21 §4.2).
 *
 * Never throws. A missing `(`, a non-identifier argument, a missing `{`/`}` all degrade
 * to a partial node plus a located diagnostic, and the cursor always advances.
 */

import { type Span, span, emptySpan } from '../types/index.js';
import { type Diagnostic, errorDiag } from '../types/index.js';
import { type ParseResult, ok, withDiagnostics } from '../types/index.js';
import { scanParens } from '../balancer/index.js';
import type { LayoutDirective } from '../at/index.js';
import type { HtmlContent, HtmlParseContext } from '../html/index.js';
import type { Token } from '../lexer/index.js';
import type { LayoutNode, RenderDirectiveNode, RenderSectionNode, SectionNode } from './nodes.js';

/** A `Render*` directive written without its mandatory parentheses (decision 85). */
const FUD_MISSING_PARENS = 'FUD0432';
/** Invalid directive argument: a non-identifier name, or arguments where none are taken. */
const FUD_BAD_ARGUMENT = 'FUD0433';
/**
 * The `{ … }` of a `@section` reuses SDD-06's block diagnostics: same rule, same message,
 * so an author who forgets a brace reads one wording, not two.
 */
const FUD_MISSING_BLOCK = 'FUD0071';
const FUD_UNCLOSED_BLOCK = 'FUD0072';

const WHITESPACE = /\s/u;
const IDENT_START = /[\p{ID_Start}$_]/u;
const IDENT_PART = /[\p{ID_Continue}$]/u;

/** EOF-safe character read: `''` past the end, so no scanner needs an undefined branch. */
function charAt(source: string, i: number): string {
  return source.charAt(i);
}

/**
 * Skip whitespace and Razor comments at offset level — the same notion of trivia SDD-06
 * applies around every `(`/`{` (decision 10). Deliberately duplicated rather than imported
 * from SDD-06: SDD-21 does not depend on the control-flow parser, and this is ten lines of
 * scanning with no state.
 */
function skipTrivia(source: string, from: number): number {
  let i = from;
  for (;;) {
    while (i < source.length && WHITESPACE.test(charAt(source, i))) i++;
    if (charAt(source, i) === '@' && charAt(source, i + 1) === '*') {
      const close = source.indexOf('*@', i + 2);
      i = close === -1 ? source.length : close + 2;
      continue;
    }
    return i;
  }
}

/** The identifier at `from`, or null when there is none. */
function identifierAt(source: string, from: number): { name: string; span: Span } | null {
  if (!IDENT_START.test(charAt(source, from))) return null;
  let i = from + 1;
  while (i < source.length && IDENT_PART.test(charAt(source, i))) i++;
  return { name: source.slice(from, i), span: span(from, i) };
}

/** The `}` that closes a `@section` body is its only boundary (mirrors SDD-06 §4.6). */
function isBlockEnd(next: Token): boolean {
  return next.type === 'block-end';
}

class DirectiveParser {
  readonly #ctx: HtmlParseContext;
  readonly #source: string;
  readonly #diagnostics: Diagnostic[] = [];

  constructor(ctx: HtmlParseContext) {
    this.#ctx = ctx;
    this.#source = ctx.source;
  }

  parse(directive: LayoutDirective, keywordSpan: Span): ParseResult<LayoutNode> {
    const start = this.#constructStart(keywordSpan);
    const node =
      directive === 'section'
        ? this.#parseSection(keywordSpan, start)
        : directive === 'RenderSection'
          ? this.#parseRenderSection(keywordSpan, start)
          : this.#parseRender(directive, keywordSpan, start);
    return this.#diagnostics.length === 0 ? ok(node) : withDiagnostics(node, this.#diagnostics);
  }

  /**
   * Where the construct starts in source. `parseDirective` only receives the keyword span
   * (SDD-04 excludes the `@`), but the node span must cover `@RenderBody()`, so the `@` is
   * recovered from the character before the keyword — it is there by construction.
   */
  #constructStart(keywordSpan: Span): number {
    const before = keywordSpan.start - 1;
    return charAt(this.#source, before) === '@' ? before : keywordSpan.start;
  }

  #error(code: string, message: string, at: Span): void {
    this.#diagnostics.push(errorDiag(code, message, at));
  }

  /** `@RenderBody()` / `@RenderHead()`: parentheses mandatory, no arguments (decision 85). */
  #parseRender(
    directive: 'RenderBody' | 'RenderHead',
    keywordSpan: Span,
    start: number,
  ): RenderDirectiveNode {
    const type = directive === 'RenderBody' ? 'render-body' : 'render-head';
    const parens = this.#parens(keywordSpan, `@${directive}`);
    if (parens === null) return { type, span: span(start, keywordSpan.end), keywordSpan };
    if (this.#source.slice(parens.inner.start, parens.inner.end).trim() !== '') {
      this.#error(FUD_BAD_ARGUMENT, `@${directive}() takes no arguments`, parens.inner);
    }
    return { type, span: span(start, parens.end), keywordSpan };
  }

  /** `@RenderSection(name)`: a bare identifier, never a string (decision 85). */
  #parseRenderSection(keywordSpan: Span, start: number): RenderSectionNode {
    const parens = this.#parens(keywordSpan, '@RenderSection');
    if (parens === null) {
      const at = emptySpan(keywordSpan.end);
      return { type: 'render-section', span: span(start, keywordSpan.end), name: '', nameSpan: at, keywordSpan };
    }
    const name = this.#identifierIn(parens.inner, '@RenderSection(name) expects a bare identifier');
    return {
      type: 'render-section',
      span: span(start, parens.end),
      name: name?.name ?? '',
      nameSpan: name?.span ?? parens.inner,
      keywordSpan,
    };
  }

  /** `@section name { … }` (decision 84). */
  #parseSection(keywordSpan: Span, start: number): SectionNode {
    const at = skipTrivia(this.#source, keywordSpan.end);
    const ident = identifierAt(this.#source, at);
    if (ident === null) {
      this.#error(FUD_BAD_ARGUMENT, '@section expects a name', emptySpan(at));
    }
    const nameEnd = ident?.span.end ?? at;
    const block = this.#block(nameEnd);
    return {
      type: 'section',
      span: span(start, block?.end ?? nameEnd),
      name: ident?.name ?? '',
      nameSpan: ident?.span ?? emptySpan(at),
      keywordSpan,
      children: block?.body ?? [],
    };
  }

  /**
   * The mandatory `( … )` after a `Render*` keyword. null ⇒ FUD0432; the cursor stays on
   * the keyword's end, so the parser resumes right after the directive name.
   */
  #parens(keywordSpan: Span, label: string): { inner: Span; end: number } | null {
    const at = skipTrivia(this.#source, keywordSpan.end);
    if (charAt(this.#source, at) !== '(') {
      this.#error(FUD_MISSING_PARENS, `${label} requires parentheses: write ${label}()`, emptySpan(at));
      return null;
    }
    const scanned = scanParens(this.#source, at);
    if (scanned.diagnostics.length > 0) this.#diagnostics.push(...scanned.diagnostics);
    this.#ctx.lexer.seekTo(scanned.value.span.end);
    return { inner: scanned.value.inner, end: scanned.value.span.end };
  }

  /** The single identifier inside `( … )`, or null (FUD0433) when it is anything else. */
  #identifierIn(inner: Span, message: string): { name: string; span: Span } | null {
    const from = skipTrivia(this.#source, inner.start);
    const ident = identifierAt(this.#source, from);
    if (ident === null || skipTrivia(this.#source, ident.span.end) !== inner.end) {
      this.#error(FUD_BAD_ARGUMENT, message, inner);
      return null;
    }
    return ident;
  }

  /** `{ html_content* }`. null ⇒ FUD0071; otherwise the body plus the offset past `}`. */
  #block(from: number): { body: readonly HtmlContent[]; end: number } | null {
    const at = skipTrivia(this.#source, from);
    if (charAt(this.#source, at) !== '{') {
      this.#error(FUD_MISSING_BLOCK, "expected '{' to open the block body", emptySpan(at));
      return null;
    }
    const lexer = this.#ctx.lexer;
    lexer.seekTo(at + 1);
    const body = this.#ctx.parseContentUntil(isBlockEnd).value;
    const closing = lexer.peek();
    if (closing.type !== 'block-end') {
      this.#error(FUD_UNCLOSED_BLOCK, "unclosed block: expected '}'", span(at, at + 1));
      return { body, end: lexer.offset };
    }
    const consumed = lexer.next();
    this.#diagnostics.push(...consumed.diagnostics);
    return { body, end: closing.span.end };
  }
}

/**
 * Parse a layout directive. SDD-05 calls this after resolving the `@` and positioning the
 * lexer just past the keyword; on return the lexer sits past the whole construct.
 */
export function parseDirective(
  ctx: HtmlParseContext,
  directive: LayoutDirective,
  keywordSpan: Span,
): ParseResult<LayoutNode> {
  return new DirectiveParser(ctx).parse(directive, keywordSpan);
}
