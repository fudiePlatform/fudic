/**
 * The strict-subset HTML parser (SDD-05). Drives the SDD-03 lexer, resolves every
 * `@` through SDD-04, and builds the offset-navigable HTML tree.
 *
 * No HTML5 error recovery (decision 38): what HTML5 would silently repair is a
 * diagnostic here. But the parser never throws — a broken tree yields a partial
 * AST plus located diagnostics, and the loop always advances.
 *
 * Control bodies and `@code` are NOT parsed here. SDD-05 depends on the
 * `AtConstructParser` abstraction and SDD-06/08 inject their implementation, which
 * is what keeps the dependency graph acyclic (DIP).
 */

import { type Span, span, emptySpan } from '../types/index.js';
import { type Diagnostic, errorDiag } from '../types/index.js';
import { type ParseResult, ok, withDiagnostics } from '../types/index.js';
import { Lexer, type Token } from '../lexer/index.js';
import {
  type ControlKeyword,
  type LayoutDirective,
  expressionFromToken,
  resolveTrigger,
} from '../at/index.js';
import type { RazorExpression } from '../at/index.js';
import { parseStyle } from '../css/index.js';
import { unknownReferences } from './entities.js';
import {
  RAW_ELEMENTS,
  VOID_ELEMENTS,
  type Attribute,
  type AttributeValuePart,
  type DocumentMode,
  type ElementKind,
  type ElementNode,
  type HtmlContent,
  type HtmlDocument,
  type Namespace,
  type RazorConstruct,
} from './nodes.js';

/**
 * Context SDD-05 hands to an injected @-construct parser so it can recurse back into HTML
 * content (e.g. an `@if` body, a `switch` case). This is the seam that keeps the dependency
 * graph acyclic: SDD-05 owns the HTML tree; SDD-06/08 own their construct grammar.
 */
export interface HtmlParseContext {
  readonly source: string;
  /** The live lexer, positioned by SDD-05 right after the resolved keyword. */
  readonly lexer: Lexer;
  /**
   * Parse a run of HTML content until `stop` matches the upcoming (peeked, NOT consumed)
   * token — e.g. the `}` closing an html_block, or a `case`/`default`/`}` in a switch.
   * The sub-parser (SDD-06) owns the braces/keywords around the body; this only fills it.
   *
   * Diagnostics produced while filling the body are accumulated by SDD-05 and surface in
   * `parseDocument`'s result, so the returned ParseResult carries none: a sub-parser that
   * merged them would emit each one twice.
   */
  parseContentUntil(stop: (next: Token) => boolean): ParseResult<readonly HtmlContent[]>;
}

/**
 * Injected by the pipeline. SDD-06 implements `parseControl`, SDD-08 implements
 * `parseCodeBlock`. When absent (isolated testing of SDD-05), control/@code degrade to an
 * UnhandledConstructNode + FUD0055. Each method leaves the lexer just past the construct.
 */
export interface AtConstructParser {
  parseControl(
    ctx: HtmlParseContext,
    keyword: ControlKeyword,
    keywordSpan: Span,
  ): ParseResult<RazorConstruct>;
  parseCodeBlock(ctx: HtmlParseContext, keywordSpan: Span): ParseResult<RazorConstruct>;
  /**
   * Layout directives (SDD-21). OPTIONAL for the same reason `atConstructs` itself is:
   * a caller that only exercises the HTML/control grammar need not know SDD-21 exists.
   * Omitted ⇒ a directive degrades to an UnhandledConstructNode + FUD0055, exactly like
   * an omitted `parseControl`.
   */
  parseDirective?(
    ctx: HtmlParseContext,
    directive: LayoutDirective,
    keywordSpan: Span,
  ): ParseResult<RazorConstruct>;
}

export interface HtmlParserOptions {
  /** Injected @-construct parsers (SDD-06/08). Omit => control/@code => UnhandledConstructNode. */
  readonly atConstructs?: AtConstructParser;
}

/** An element on the open stack: enough to match its close tag. */
interface OpenElement {
  readonly name: string;
  readonly namespace: Namespace;
}

/** decision 51: the mode is fixed by whether the file opens with a doctype. */
const DOCTYPE_START = /^\s*<!DOCTYPE/iu;

/**
 * Whether this attribute's value is a HANDLER — an event binding (`@click`) or a bus
 * subscription (`bus:carrito`, `bus:(EVENTOS.carrito)`). It is the one position where an
 * implicit expression may end in a call (decision 99).
 *
 * The two prefixes are spelled out here rather than imported from SDD-07: that module
 * classifies bindings and already depends on this one, and the dependency only runs one
 * way. The tokenizer holds the same knowledge for the same reason (the `bus:(` rule).
 */
function isHandlerName(name: string | RazorExpression): boolean {
  // An expression name is only legal after `bus:`, and the lexer produces one nowhere else.
  return typeof name !== 'string' || name.startsWith('@') || name.startsWith('bus:');
}

class HtmlParser {
  readonly #source: string;
  readonly #lexer: Lexer;
  readonly #diagnostics: Diagnostic[] = [];
  readonly #atConstructs: AtConstructParser | undefined;
  /** Open elements, innermost last. Only `normal` elements are pushed. */
  readonly #open: OpenElement[] = [];

  /**
   * Whether a start tag ran off the end of the file (BUG-22 §6).
   *
   * The lexer leaves tag mode on a `>` or at EOF and nowhere else, so a `<div` with no `>` eats
   * everything after it — the `</template>` the author DID write included. Every ancestor is
   * then reported unclosed, and each of those diagnostics is false: the close tag is right
   * there in the file, it was swallowed by the first mistake.
   *
   * Once this is set nothing more is reported unclosed. What follows an unterminated tag is not
   * a tree the parser has an opinion about.
   */
  #tagRanOff = false;

  constructor(source: string, atConstructs: AtConstructParser | undefined) {
    this.#source = source;
    this.#lexer = new Lexer(source);
    this.#atConstructs = atConstructs;
  }

  parse(): ParseResult<HtmlDocument> {
    const mode: DocumentMode = DOCTYPE_START.test(this.#source) ? 'page' : 'component';
    const children = this.#parseContent('html');
    const document: HtmlDocument = {
      type: 'document',
      mode,
      span: span(0, this.#source.length),
      children,
    };
    return this.#diagnostics.length === 0
      ? ok(document)
      : withDiagnostics(document, this.#diagnostics);
  }

  // ------------------------------------------------------------------
  // Lexer plumbing
  // ------------------------------------------------------------------

  /** Consume one token, collecting the diagnostics the lexer produced reading it. */
  #next(): Token {
    const result = this.#lexer.next();
    if (result.diagnostics.length > 0) this.#diagnostics.push(...result.diagnostics);
    return result.value;
  }

  #slice(at: Span): string {
    return this.#source.slice(at.start, at.end);
  }

  #error(code: string, message: string, at: Span): void {
    this.#diagnostics.push(errorDiag(code, message, at));
  }

  // ------------------------------------------------------------------
  // Content
  // ------------------------------------------------------------------

  /**
   * Parse a run of content. Stops at EOF, at `stop`, or at a close tag belonging to
   * an element still open — that one is the caller's to consume.
   */
  #parseContent(namespace: Namespace, stop?: (next: Token) => boolean): HtmlContent[] {
    const out: HtmlContent[] = [];
    for (;;) {
      const token = this.#lexer.peek();
      if (token.type === 'eof') break;
      if (stop !== undefined && stop(token)) break;

      if (token.type === 'tag-close') {
        if (this.#isOpen(token.name)) break;
        this.#next();
        this.#orphanClose(token.name, token.span);
        continue;
      }

      const node = this.#parseNode(token, namespace);
      if (node !== null) out.push(node);
    }
    return out;
  }

  #parseNode(token: Token, namespace: Namespace): HtmlContent | null {
    switch (token.type) {
      case 'tag-open-start':
        return this.#parseElement(namespace);

      case 'at-trigger':
        return this.#parseAt(namespace);

      case 'text':
      case 'whitespace': {
        this.#next();
        this.#checkReferences(token.span);
        return { type: 'text', span: token.span, value: this.#slice(token.span) };
      }

      case 'html-comment': {
        this.#next();
        return { type: 'comment', span: token.span, value: this.#commentValue(token.span) };
      }

      case 'doctype': {
        this.#next();
        return { type: 'doctype', span: token.span };
      }

      case 'cdata': {
        this.#next();
        // Valid only inside foreign content (decision 50); elsewhere it is an error,
        // but the node is still produced so the tree stays navigable.
        if (namespace === 'html') {
          this.#error('FUD0054', 'CDATA section outside SVG or MathML content', token.span);
        }
        return { type: 'cdata', span: token.span, value: this.#cdataValue(token.span) };
      }

      case 'explicit-expr': {
        this.#next();
        return expressionFromToken(token);
      }

      case 'inline-code': {
        this.#next();
        return { type: 'inline-code', span: token.span, group: token.group };
      }

      case 'at-escape': {
        this.#next();
        return { type: 'at-escape', span: token.span };
      }

      case 'razor-comment': {
        this.#next();
        return { type: 'razor-comment', span: token.span };
      }

      case 'raw-text': {
        this.#next();
        return {
          type: 'raw-text',
          span: token.span,
          value: this.#slice(token.span),
          element: token.element,
        };
      }

      case 'block-end':
      case 'switch-label': {
        // A `}` with no control body open degrades to text (§4.7); inside a body,
        // parseContentUntil stops on it before we get here. A switch-label only
        // exists under the switch marker, so outside one it degrades the same way.
        this.#next();
        return { type: 'text', span: token.span, value: this.#slice(token.span) };
      }

      default: {
        // Stray in-tag token in content position: consume so the loop progresses.
        this.#next();
        return null;
      }
    }
  }

  /**
   * Report every well-formed character reference the strict subset cannot resolve (decision
   * 38 / decision 49 as BUG-14 §3.2 leaves it). The text stays VERBATIM in the AST — the
   * formatter and the LSP read the author's bytes there; the emit is what decodes.
   */
  #checkReferences(at: Span): void {
    for (const unknown of unknownReferences(this.#slice(at), at.start)) {
      this.#error('FUD0057', `unknown character reference ${unknown.text}`, unknown.span);
    }
  }

  #commentValue(at: Span): string {
    const raw = this.#slice(at);
    const body = raw.slice(4);
    return body.endsWith('-->') ? body.slice(0, -3) : body;
  }

  #cdataValue(at: Span): string {
    const raw = this.#slice(at);
    const body = raw.slice(9);
    return body.endsWith(']]>') ? body.slice(0, -3) : body;
  }

  // ------------------------------------------------------------------
  // Elements
  // ------------------------------------------------------------------

  #parseElement(parentNamespace: Namespace): ElementNode {
    const openToken = this.#next();
    if (openToken.type !== 'tag-open-start') throw new Error('unreachable');
    const name = openToken.name;
    const lower = name.toLowerCase();

    // The namespace comes from the parser's own stack, not from `lexer.mode`: the
    // lexer only pushes svg/math on the `>` of the start tag, so the root element
    // itself would miss it, and a <script> would report `raw` rather than a namespace.
    const namespace: Namespace =
      parentNamespace === 'html' && (lower === 'svg' || lower === 'math')
        ? lower
        : parentNamespace;

    const { attributes, endToken } = this.#parseAttributes();
    const openSpan = span(openToken.span.start, endToken?.span.end ?? openToken.span.end);

    const base = {
      type: 'element',
      name,
      namespace,
      attributes,
      openSpan,
    } as const;

    if (endToken?.type === 'tag-self-close') {
      return { ...base, kind: 'self-closing', children: [], span: openSpan };
    }
    if (VOID_ELEMENTS.has(lower)) {
      return { ...base, kind: 'void', children: [], span: openSpan };
    }
    if (RAW_ELEMENTS.has(lower)) {
      return this.#finishRawElement(base, openSpan, lower);
    }

    this.#open.push({ name, namespace });
    const children = this.#parseContent(namespace);
    this.#open.pop();

    return this.#closeElement({ ...base, kind: 'normal', children }, openSpan, name, namespace);
  }

  /**
   * `<script>` / `<style>`: the lexer already handed the body over as one opaque
   * token. `<script>` stays a verbatim `RawTextNode`; a `<style>` body is parsed
   * for its Razor interpolations and brace balance (SDD-09), so its child is the
   * `StyleNode` `parseStyle` returns over that same body span.
   */
  #finishRawElement(
    base: Omit<ElementNode, 'kind' | 'children' | 'span' | 'closeSpan'>,
    openSpan: Span,
    lower: string,
  ): ElementNode {
    const children: HtmlContent[] = [];
    const body = this.#lexer.peek();
    if (body.type === 'raw-text') {
      this.#next();
      if (lower === 'style') {
        const styled = parseStyle(this.#source, body.span);
        if (styled.diagnostics.length > 0) this.#diagnostics.push(...styled.diagnostics);
        children.push(styled.value);
      } else {
        children.push({
          type: 'raw-text',
          span: body.span,
          value: this.#slice(body.span),
          element: body.element,
        });
      }
    }
    return this.#closeElement({ ...base, kind: 'raw', children }, openSpan, lower, 'html');
  }

  /** Attach the close tag if it is ours; otherwise report the element as unclosed. */
  #closeElement(
    element: Omit<ElementNode, 'span' | 'closeSpan'>,
    openSpan: Span,
    name: string,
    namespace: Namespace,
  ): ElementNode {
    const ahead = this.#lexer.peek();
    if (ahead.type === 'tag-close' && this.#namesMatch(ahead.name, name, namespace)) {
      this.#next();
      return {
        ...element,
        span: span(openSpan.start, ahead.span.end),
        closeSpan: ahead.span,
      };
    }
    // Unclosed: located on the START tag, which is the actionable place in an editor. One
    // report per file once a tag ran off the end — everything outside it is a consequence.
    if (!this.#tagRanOff) {
      this.#error('FUD0052', `unclosed <${name}> element`, openSpan);
      this.#tagRanOff = this.#ranOff(openSpan);
    }
    // `closeSpan` is OMITTED, never set to undefined (exactOptionalPropertyTypes).
    return { ...element, span: span(openSpan.start, this.#lexer.offset) };
  }

  /**
   * Whether this start tag ran past where it should have ended.
   *
   * Two shapes, and they are the same accident seen from either end. The tag reached EOF with
   * no `>` at all; or it found one — and it belonged to somebody else, because a `</` inside a
   * start tag is a close tag the lexer read as an attribute name while it waited for a `>`
   * that was never coming. `<div` followed by `</template>` ends on the template's own `>`.
   *
   * A `</` inside a quoted value would say yes here and is not this. The cost is that a
   * genuinely unclosed ancestor goes unreported in a file that already has an error two lines
   * up, which is the direction to be wrong in.
   */
  #ranOff(openSpan: Span): boolean {
    return this.#source[openSpan.end - 1] !== '>' || this.#slice(openSpan).includes('</', 1);
  }

  /** Tag names are case-insensitive in HTML, case-sensitive in svg/math (decision 41.b). */
  #namesMatch(a: string, b: string, namespace: Namespace): boolean {
    return namespace === 'html' ? a.toLowerCase() === b.toLowerCase() : a === b;
  }

  #isOpen(name: string): boolean {
    return this.#open.some((e) => this.#namesMatch(name, e.name, e.namespace));
  }

  #orphanClose(name: string, at: Span): void {
    if (VOID_ELEMENTS.has(name.toLowerCase())) {
      this.#error('FUD0053', `void element <${name}> must not have a close tag`, at);
      return;
    }
    this.#error('FUD0051', `close tag </${name}> matches no open element`, at);
  }

  // ------------------------------------------------------------------
  // Attributes
  // ------------------------------------------------------------------

  #parseAttributes(): { attributes: Attribute[]; endToken: Token | null } {
    const attributes: Attribute[] = [];
    for (;;) {
      const token = this.#lexer.peek();
      if (token.type === 'eof') return { attributes, endToken: null };
      if (token.type === 'tag-open-end' || token.type === 'tag-self-close') {
        this.#next();
        return { attributes, endToken: token };
      }
      if (token.type === 'attr-name') {
        attributes.push(this.#parseAttribute());
        continue;
      }
      // Whitespace between attributes, or a stray token: neither produces a node.
      this.#next();
    }
  }

  #parseAttribute(): Attribute {
    const nameToken = this.#next();
    if (nameToken.type !== 'attr-name') throw new Error('unreachable');
    let name: string | RazorExpression = nameToken.name;
    let end = nameToken.span.end;

    // `bus:(EVENTOS.carrito)` (decision 28.b): the tokenizer split the reserved
    // prefix from the expression that names the event.
    if (nameToken.name.endsWith(':')) {
      const ahead = this.#lexer.peek();
      if (ahead.type === 'explicit-expr') {
        this.#next();
        name = expressionFromToken(ahead);
        end = ahead.span.end;
      }
    }

    const value: AttributeValuePart[] = [];
    this.#skipInTagWhitespace();
    if (this.#lexer.peek().type === 'attr-eq') {
      this.#next();
      this.#skipInTagWhitespace();
      const quote = this.#lexer.peek();
      end =
        quote.type === 'attr-quote-open'
          ? this.#parseQuotedValue(value, isHandlerName(name))
          : this.#parseUnquotedValue(value);
    }

    return { type: 'attribute', span: span(nameToken.span.start, end), name, value };
  }

  /** Whitespace inside a tag is insignificant and produces no node (§4.6). */
  #skipInTagWhitespace(): void {
    while (this.#lexer.peek().type === 'whitespace') this.#next();
  }

  #parseQuotedValue(parts: AttributeValuePart[], call = false): number {
    this.#next(); // the opening quote
    for (;;) {
      const token = this.#lexer.peek();
      if (token.type === 'attr-quote-close') {
        this.#next();
        return token.span.end;
      }
      // The lexer already reported the unterminated value (FUD0015).
      if (token.type === 'eof') return this.#lexer.offset;

      if (token.type === 'at-trigger') {
        const part = this.#attributeAtom(call);
        if (part !== null) parts.push(part);
        continue;
      }

      this.#next();
      switch (token.type) {
        case 'text':
          this.#checkReferences(token.span);
          parts.push({
            type: 'attribute-text',
            span: token.span,
            value: this.#slice(token.span),
          });
          break;
        case 'explicit-expr':
          parts.push(expressionFromToken(token));
          break;
        case 'at-escape':
          // `@@` means one literal `@` (decision 1). AttributeValuePart has no escape
          // node, so it resolves here to the character it denotes.
          parts.push({ type: 'attribute-text', span: token.span, value: '@' });
          break;
        default:
          break;
      }
    }
  }

  /**
   * An `@` atom in value position. Only expressions are value parts.
   *
   * `call` carries decision 99 down: in the value of an `@event` / `bus:` binding an
   * implicit expression may end in a balanced call, so `@del($event, item.id)` is ONE
   * atom instead of the path `del` plus literal text.
   */
  #attributeAtom(call: boolean): AttributeValuePart | null {
    const trigger = this.#next();
    const resolved = resolveTrigger(this.#source, trigger.span.start, { call });
    if (resolved.diagnostics.length > 0) this.#diagnostics.push(...resolved.diagnostics);
    const resolution = resolved.value;

    switch (resolution.kind) {
      case 'implicit':
      case 'raw':
        // `@raw(x)` in a value has no escaping to switch off, so only its expression
        // survives; SDD-07 reads escape semantics from content position.
        this.#lexer.seekTo(resolution.expression.span.end);
        return resolution.expression;
      case 'control':
      case 'code-block':
      case 'directive': {
        // A control keyword or a layout directive cannot open a construct inside an
        // attribute value: what the author wrote is literal text there.
        this.#lexer.seekTo(resolution.keywordSpan.end);
        const at = span(trigger.span.start, resolution.keywordSpan.end);
        return { type: 'attribute-text', span: at, value: this.#slice(at) };
      }
    }
  }

  /**
   * A value with no quotes (decision 8 / FUD0056). The lexer already cut the run at
   * the first whitespace, `>` or `/>`, which is exactly the recovery §4.6 prescribes.
   */
  #parseUnquotedValue(parts: AttributeValuePart[]): number {
    const token = this.#lexer.peek();
    if (token.type === 'text') {
      this.#next();
      this.#error('FUD0056', 'attribute value must be quoted', token.span);
      this.#checkReferences(token.span);
      parts.push({ type: 'attribute-text', span: token.span, value: this.#slice(token.span) });
      return token.span.end;
    }
    const at = emptySpan(this.#lexer.offset);
    this.#error('FUD0056', 'attribute value must be quoted', at);
    return at.end;
  }

  // ------------------------------------------------------------------
  // The `@` in content (§4.5)
  // ------------------------------------------------------------------

  #parseAt(namespace: Namespace): HtmlContent {
    const trigger = this.#next();
    const at = trigger.span.start;
    const resolved = resolveTrigger(this.#source, at);
    if (resolved.diagnostics.length > 0) this.#diagnostics.push(...resolved.diagnostics);
    const resolution = resolved.value;

    switch (resolution.kind) {
      case 'implicit':
        this.#lexer.seekTo(resolution.expression.span.end);
        return resolution.expression;

      case 'raw':
        this.#lexer.seekTo(resolution.expression.span.end);
        return {
          type: 'raw-expression',
          span: resolution.expression.span,
          expr: resolution.expression,
        };

      case 'control': {
        this.#lexer.seekTo(resolution.keywordSpan.end);
        const handler = this.#atConstructs;
        if (handler === undefined) {
          return this.#unhandled(at, resolution.keywordSpan, resolution.keyword);
        }
        return this.#delegate(
          handler.parseControl(this.#context(namespace), resolution.keyword, resolution.keywordSpan),
        );
      }

      case 'code-block': {
        this.#lexer.seekTo(resolution.keywordSpan.end);
        const handler = this.#atConstructs;
        if (handler === undefined) {
          return this.#unhandled(at, resolution.keywordSpan, 'code');
        }
        return this.#delegate(
          handler.parseCodeBlock(this.#context(namespace), resolution.keywordSpan),
        );
      }

      case 'directive': {
        this.#lexer.seekTo(resolution.keywordSpan.end);
        const handler = this.#atConstructs;
        if (handler?.parseDirective === undefined) {
          return this.#unhandled(at, resolution.keywordSpan, resolution.directive);
        }
        return this.#delegate(
          handler.parseDirective(
            this.#context(namespace),
            resolution.directive,
            resolution.keywordSpan,
          ),
        );
      }
    }
  }

  #delegate(result: ParseResult<RazorConstruct>): RazorConstruct {
    if (result.diagnostics.length > 0) this.#diagnostics.push(...result.diagnostics);
    return result.value;
  }

  #unhandled(at: number, keywordSpan: Span, keyword: string): HtmlContent {
    const whole = span(at, keywordSpan.end);
    this.#error('FUD0055', `no parser injected for the @${keyword} construct`, whole);
    return { type: 'unhandled-construct', span: whole, keyword };
  }

  #context(namespace: Namespace): HtmlParseContext {
    return {
      source: this.#source,
      lexer: this.#lexer,
      parseContentUntil: (stop) => ok(this.#parseContent(namespace, stop)),
    };
  }
}

/**
 * Parse a whole .fud source into an HTML AST. Drives a fresh Lexer internally, resolves each
 * `@` via SDD-04, delegates control/@code via `options.atConstructs`. Never throws: a broken
 * tree yields a partial AST plus diagnostics.
 */
export function parseDocument(
  source: string,
  options?: HtmlParserOptions,
): ParseResult<HtmlDocument> {
  return new HtmlParser(source, options?.atConstructs).parse();
}

export type { ElementKind, Namespace, DocumentMode };
