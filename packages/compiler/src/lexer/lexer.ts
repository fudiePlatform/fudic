/**
 * The lazy, mode-driven tokenizer cursor (SDD-03). Reads the `.fud` text and cuts
 * it into contextual tokens, each carrying its Span. The upper layers (SDD-04/05/06)
 * DRIVE this cursor: they pull tokens, push/pop modes at the transitions they own,
 * and seek to resume after a balanced header.
 *
 * Balanced JS regions are opaque atoms whose span comes from the balancer (SDD-02);
 * their contents are validated by Oxc later (SDD-11). Never throws.
 */

import { type Span, span, emptySpan } from '../types/index.js';
import { type Diagnostic, errorDiag } from '../types/index.js';
import { type ParseResult, ok, withDiagnostics } from '../types/index.js';
import { type Mode, ModeStack } from '../types/index.js';
import { scanParens, scanBraces } from '../balancer/index.js';
import type { Token, PlainToken } from './token.js';

/** Plain-token types: everything with no payload beyond type + span. */
type PlainTokenType = PlainToken['type'];

/** Deferred state change of a token, applied only when the token is consumed. */
type Transition = () => void;

/** One token scanned ahead, plus the state it was scanned in. */
interface Lookahead {
  readonly start: number;
  readonly mode: Mode;
  readonly result: ParseResult<Token>;
  readonly transition: Transition | null;
}

const ASCII_LETTER = /[a-zA-Z]/u;
const IDENT_START = /[\p{ID_Start}$_]/u;
const IDENT_PART = /[\p{ID_Continue}$]/u;
const WHITESPACE = /\s/u;

/** Characters that terminate an attribute name run. */
const ATTR_NAME_STOP = new Set([' ', '\t', '\n', '\r', '\f', '=', '>', '"', "'", '(']);

/** Elements whose body is opaque: no tags, no Razor (decision 43). */
const OPAQUE_RAW = new Set(['script']);
/** Elements whose body is RCDATA: text and `@` atoms, no nested tags (§4.6). */
const RCDATA_RAW = new Set(['title', 'textarea']);

export class Lexer {
  readonly #source: string;
  readonly #length: number;
  readonly #modes: ModeStack;

  /** Raw scan cursor. While a token is buffered this runs ahead of `offset`. */
  #offset = 0;
  #lookahead: Lookahead | null = null;
  /** Scratch slot a scan method fills with the token's deferred state change. */
  #transition: Transition | null = null;

  // --- Lexical context the mode stack cannot express (see the class docs) ---
  /** Inside a start tag's attribute list. */
  #inTag = false;
  /** Inside a quoted attribute value. */
  #inAttrValue = false;
  /** The quote character that opened the current attribute value. */
  #quote = '"';
  /** An `=` was just emitted: what follows is a value, quoted or not. */
  #afterAttrEq = false;
  /** Name of the start tag currently being read, for the mode decision at `>`. */
  #pendingTag = '';
  /** The last attribute name emitted, for the `bus:(` rule (decision 28.b). */
  #lastAttrName = '';
  /** Lowercased element owning the current raw/css body. */
  #rawElement = '';
  /** Whether Razor atoms are live in the current raw body (§4.6). */
  #rawRazor = false;
  /**
   * Open elements that can close the current mode, innermost last. `owns` is false
   * for a nested element sharing the owner's name (a `<svg>` inside an `<svg>`):
   * it must swallow its own close tag so the outer one keeps the mode.
   */
  readonly #modeOwners: { readonly name: string; readonly owns: boolean }[] = [];
  /**
   * Depth of open `@switch` bodies. SDD-03 §4.3 calls for a `switch-body` marker
   * on the ModeStack, but `Mode` is a closed taxonomy (SDD-01) that §4.2 forbids
   * widening. A counter on the cursor keeps both invariants: the marker is lexer
   * state, travels with the cursor, and `Mode` stays closed.
   */
  #switchDepth = 0;

  /** baseMode defaults to 'html' (the parser's default mode, SDD-01 §4.4). */
  constructor(source: string, baseMode: Mode = 'html') {
    this.#source = source;
    this.#length = source.length;
    this.#modes = new ModeStack(baseMode);
  }

  /** Current scan offset (the start of the next token). */
  get offset(): number {
    return this.#lookahead ? this.#lookahead.start : this.#offset;
  }

  /** Current mode (top of the stack). Never undefined: the stack never empties. */
  get mode(): Mode {
    return this.#lookahead ? this.#lookahead.mode : this.#modes.current;
  }

  /** True once the cursor has reached the end of source. */
  get atEnd(): boolean {
    return this.offset >= this.#length;
  }

  /** Depth of open `@switch` bodies (see `#switchDepth`). */
  get switchDepth(): number {
    return this.#switchDepth;
  }

  /**
   * The next token WITHOUT consuming it. Best-effort lookahead for the parser's
   * decisions; the authoritative diagnostics of that token are delivered when it is
   * consumed via next() (a one-token buffer prevents double emission).
   */
  peek(): Token {
    return this.#fill().result.value;
  }

  /** Consume and return the next token plus any diagnostics produced reading it. */
  next(): ParseResult<Token> {
    const ahead = this.#fill();
    this.#lookahead = null;
    // The token is only now committed, so its state change applies now too.
    ahead.transition?.();
    return ahead.result;
  }

  /** Push a new mode (raw/css/svg/math/js). The caller documents the transition. */
  pushMode(mode: Mode): void {
    this.#rewind();
    this.#modes.push(mode);
  }

  /** Pop the current mode. Delegates to ModeStack.pop (FUD0001 on background pop). */
  popMode(at: number): ParseResult<Mode> {
    this.#rewind();
    return this.#modes.pop(at);
  }

  /**
   * Open a `@switch` body: `case` / `default` at token start now cut the text run
   * and surface as `switch-label` (decision 80). SDD-06 brackets the body with this.
   */
  pushSwitchBody(): void {
    this.#rewind();
    this.#switchDepth++;
  }

  /** Close a `@switch` body. A pop with no body open is ignored (never throws). */
  popSwitchBody(): void {
    this.#rewind();
    if (this.#switchDepth > 0) this.#switchDepth--;
  }

  /**
   * Reposition the cursor to `offset` (must be >= current offset; forward-only).
   * Used by SDD-04 to resume html-mode tokenization right after a balanced control
   * header it consumed via the balancer. Clears the lookahead buffer.
   */
  seekTo(offset: number): void {
    const from = this.offset;
    this.#lookahead = null;
    this.#offset = offset >= from ? Math.min(offset, this.#length) : from;
  }

  // ------------------------------------------------------------------
  // Cursor plumbing
  // ------------------------------------------------------------------

  /** Scans one token into the lookahead slot if it is empty. */
  #fill(): Lookahead {
    const buffered = this.#lookahead;
    if (buffered !== null) return buffered;
    const start = this.#offset;
    const mode = this.#modes.current;
    this.#transition = null;
    const result = this.#scan();
    const ahead: Lookahead = { start, mode, result, transition: this.#transition };
    this.#transition = null;
    this.#lookahead = ahead;
    return ahead;
  }

  /**
   * Drops the lookahead and rewinds the raw cursor to its start. Safe precisely
   * because a merely-peeked token has not applied its transition yet: no state
   * change needs undoing.
   */
  #rewind(): void {
    const buffered = this.#lookahead;
    if (buffered === null) return;
    this.#offset = buffered.start;
    this.#lookahead = null;
  }

  #at(i: number): string | undefined {
    return this.#source[i];
  }

  /** Case-insensitive literal match at `i`. */
  #matches(i: number, literal: string): boolean {
    return this.#source.slice(i, i + literal.length).toLowerCase() === literal.toLowerCase();
  }

  #plain(type: PlainTokenType, start: number, end: number): PlainToken {
    return { type, span: span(start, end) };
  }

  #emit(type: PlainTokenType, start: number, end: number): ParseResult<Token> {
    this.#offset = end;
    return ok(this.#plain(type, start, end));
  }

  #emitWith(
    type: PlainTokenType,
    start: number,
    end: number,
    diagnostics: readonly Diagnostic[],
  ): ParseResult<Token> {
    this.#offset = end;
    return withDiagnostics(this.#plain(type, start, end), diagnostics);
  }

  #error(code: string, message: string, at: Span): Diagnostic {
    return errorDiag(code, message, at);
  }

  // ------------------------------------------------------------------
  // Dispatch
  // ------------------------------------------------------------------

  #scan(): ParseResult<Token> {
    if (this.#offset >= this.#length) {
      return ok(this.#plain('eof', this.#length, this.#length));
    }
    if (this.#inAttrValue) return this.#scanAttrValue();
    if (this.#inTag) return this.#scanInTag();

    const mode = this.#modes.current;
    if (mode === 'raw' || mode === 'css') return this.#scanRawBody();
    if (mode === 'js') return this.#scanJsPlaceholder();
    return this.#scanContent();
  }

  /**
   * Placeholder, exactly parallel to the css one (§4.7): the `js` mode belongs to
   * SDD-04/08, which drive the balancer and `seekTo` rather than pulling tokens.
   * Until they land, the remainder is one opaque `text` token so the cursor still
   * covers the source and never hangs.
   */
  #scanJsPlaceholder(): ParseResult<Token> {
    return this.#emit('text', this.#offset, this.#length);
  }

  // ------------------------------------------------------------------
  // Content (html / svg / math)
  // ------------------------------------------------------------------

  #scanContent(): ParseResult<Token> {
    const start = this.#offset;
    const c = this.#at(start);
    if (c === '<') return this.#scanMarkup();
    if (c === '@' && !this.#isLiteralAt(start)) return this.#scanAt();
    // A raw `}` ALWAYS closes a control body (decision 79): a literal brace in
    // markup is written as an entity, so no flag is needed here.
    if (c === '}') return this.#emit('block-end', start, start + 1);
    const label = this.#switchLabelAt(start);
    if (label > 0) return this.#emit('switch-label', start, start + label);
    return this.#scanText();
  }

  /** Text run, up to the next `<`, significant `@`, `}` or switch label. */
  #scanText(): ParseResult<Token> {
    const start = this.#offset;
    let i = start;
    while (i < this.#length) {
      const c = this.#at(i);
      if (c === undefined || c === '<' || c === '}') break;
      if (c === '@') {
        // An `@` that forms a word with what precedes it is literal (decision 7):
        // absorb it and keep going, so `user@dominio.com` stays one text run.
        if (!this.#isLiteralAt(i)) break;
        i++;
        continue;
      }
      if (i > start && this.#switchLabelAt(i) > 0) break;
      i++;
    }
    return this.#emit('text', start, i);
  }

  /**
   * True when the `@` at `i` is literal because the previous character is an
   * identifier character (the email lookbehind of decision 7).
   */
  #isLiteralAt(i: number): boolean {
    const prev = this.#at(i - 1);
    return prev !== undefined && IDENT_PART.test(prev);
  }

  /**
   * Length of a `case` / `default` keyword at `i`, or 0. Only inside a switch body,
   * only at a word boundary: cutting on the word "case" in prose would be absurd.
   */
  #switchLabelAt(i: number): number {
    if (this.#switchDepth === 0) return 0;
    const prev = this.#at(i - 1);
    if (prev !== undefined && IDENT_PART.test(prev)) return 0;
    for (const word of ['case', 'default']) {
      if (this.#source.startsWith(word, i)) {
        const after = this.#at(i + word.length);
        if (after === undefined || !IDENT_PART.test(after)) return word.length;
      }
    }
    return 0;
  }

  // ------------------------------------------------------------------
  // The `@` character (§4.4)
  // ------------------------------------------------------------------

  #scanAt(): ParseResult<Token> {
    const start = this.#offset;
    const n = this.#at(start + 1);

    // `@@` -> a literal `@` in the output (decision 1).
    if (n === '@') return this.#emit('at-escape', start, start + 2);

    // `@* ... *@` -> Razor comment, not nestable (decision 36).
    if (n === '*') return this.#scanRazorComment(start);

    // `@(` / `@{` -> opaque balanced JS region; the balancer owns the boundary.
    if (n === '(') return this.#scanJsRegion(start, 'explicit-expr');
    if (n === '{') return this.#scanJsRegion(start, 'inline-code');

    // `@` + identifier start -> deferred to SDD-04. The span covers ONLY the `@`:
    // the tokenizer does not decide keyword vs implicit expression.
    if (n !== undefined && IDENT_START.test(n)) {
      return this.#emit('at-trigger', start, start + 1);
    }

    // Anything else: degrade to literal text, never throw.
    return this.#emitWith('text', start, start + 1, [
      this.#error('FUD0010', 'character after @ does not start a Razor construct', emptySpan(start)),
    ]);
  }

  #scanRazorComment(start: number): ParseResult<Token> {
    const close = this.#source.indexOf('*@', start + 2);
    if (close === -1) {
      return this.#emitWith('razor-comment', start, this.#length, [
        this.#error('FUD0011', 'unterminated Razor comment', emptySpan(this.#length)),
      ]);
    }
    return this.#emit('razor-comment', start, close + 2);
  }

  /** `@(` and `@{`: the span runs from the `@` through the balancer's group. */
  #scanJsRegion(start: number, type: 'explicit-expr' | 'inline-code'): ParseResult<Token> {
    const openAt = start + 1;
    const scanned =
      type === 'explicit-expr'
        ? scanParens(this.#source, openAt)
        : scanBraces(this.#source, openAt);
    const end = scanned.value.span.end;
    this.#offset = end;
    const token: Token = { type, span: span(start, end), group: scanned.value };
    return scanned.diagnostics.length === 0
      ? ok(token)
      : withDiagnostics(token, scanned.diagnostics);
  }

  // ------------------------------------------------------------------
  // Markup: `<...`
  // ------------------------------------------------------------------

  #scanMarkup(): ParseResult<Token> {
    const start = this.#offset;
    const n = this.#at(start + 1);

    if (n === '!') {
      if (this.#matches(start, '<!--')) return this.#scanHtmlComment(start);
      if (this.#matches(start, '<![cdata[')) return this.#scanCdata(start);
      if (this.#matches(start, '<!doctype')) return this.#scanDoctype(start);
      return this.#malformedTag(start);
    }
    if (n === '/') return this.#scanCloseTag();
    if (n !== undefined && ASCII_LETTER.test(n)) return this.#scanOpenTagStart();
    return this.#malformedTag(start);
  }

  /** `<` not followed by a name, `/` or `!`: emit it as text and carry on. */
  #malformedTag(start: number): ParseResult<Token> {
    return this.#emitWith('text', start, start + 1, [
      this.#error('FUD0013', 'malformed tag', emptySpan(start)),
    ]);
  }

  #scanHtmlComment(start: number): ParseResult<Token> {
    const close = this.#source.indexOf('-->', start + 4);
    if (close === -1) {
      return this.#emitWith('html-comment', start, this.#length, [
        this.#error('FUD0012', 'unterminated HTML comment', emptySpan(this.#length)),
      ]);
    }
    return this.#emit('html-comment', start, close + 3);
  }

  #scanCdata(start: number): ParseResult<Token> {
    const close = this.#source.indexOf(']]>', start + 9);
    if (close === -1) {
      return this.#emitWith('cdata', start, this.#length, [
        this.#error('FUD0016', 'unterminated CDATA section', emptySpan(this.#length)),
      ]);
    }
    return this.#emit('cdata', start, close + 3);
  }

  #scanDoctype(start: number): ParseResult<Token> {
    const close = this.#source.indexOf('>', start);
    const end = close === -1 ? this.#length : close + 1;
    return this.#emit('doctype', start, end);
  }

  #scanOpenTagStart(): ParseResult<Token> {
    const start = this.#offset;
    const nameEnd = this.#nameEnd(start + 1);
    const name = this.#source.slice(start + 1, nameEnd);
    this.#offset = nameEnd;
    this.#transition = (): void => {
      this.#inTag = true;
      this.#pendingTag = name;
      this.#lastAttrName = '';
    };
    return ok({ type: 'tag-open-start', span: span(start, nameEnd), name });
  }

  #scanCloseTag(): ParseResult<Token> {
    const start = this.#offset;
    const nameEnd = this.#nameEnd(start + 2);
    const name = this.#source.slice(start + 2, nameEnd);
    const close = this.#source.indexOf('>', nameEnd);
    const end = close === -1 ? this.#length : close + 1;
    this.#offset = end;

    const lower = name.toLowerCase();
    const owner = this.#modeOwners[this.#modeOwners.length - 1];
    if (owner !== undefined && owner.name === lower) {
      const owns = owner.owns;
      this.#transition = (): void => {
        this.#modeOwners.pop();
        if (!owns) return;
        // Cannot underflow: this pop matches a push the tokenizer itself made.
        this.#modes.pop(start);
        this.#rawElement = '';
        this.#rawRazor = false;
      };
    }
    return ok({ type: 'tag-close', span: span(start, end), name });
  }

  /** End of a tag name starting at `i`. Names are verbatim; case is the caller's problem. */
  #nameEnd(i: number): number {
    let j = i;
    while (j < this.#length) {
      const c = this.#at(j);
      if (c === undefined) break;
      if (!ASCII_LETTER.test(c) && !/[0-9\-_.:]/u.test(c)) break;
      j++;
    }
    return j;
  }

  // ------------------------------------------------------------------
  // Inside a start tag
  // ------------------------------------------------------------------

  #scanInTag(): ParseResult<Token> {
    const start = this.#offset;
    const c = this.#at(start);
    if (c === undefined) return ok(this.#plain('eof', this.#length, this.#length));

    if (WHITESPACE.test(c)) return this.#scanWhitespace();

    if (c === '>') {
      this.#transition = (): void => {
        this.#inTag = false;
        this.#afterAttrEq = false;
        this.#openBody(this.#pendingTag);
      };
      return this.#emit('tag-open-end', start, start + 1);
    }

    if (c === '/' && this.#at(start + 1) === '>') {
      this.#transition = (): void => {
        this.#inTag = false;
        this.#afterAttrEq = false;
      };
      return this.#emit('tag-self-close', start, start + 2);
    }

    if (c === '=') {
      this.#transition = (): void => {
        this.#afterAttrEq = true;
      };
      return this.#emit('attr-eq', start, start + 1);
    }

    if (c === '"' || c === "'") {
      const quote = c;
      this.#transition = (): void => {
        this.#inAttrValue = true;
        this.#afterAttrEq = false;
        this.#quote = quote;
      };
      return this.#emit('attr-quote-open', start, start + 1);
    }

    // `bus:(EVENTOS.carrito)` (decision 28.b): after a name prefix ending in `:`,
    // a `(` opens an expression name — the same balancer call as in value position.
    if (c === '(' && this.#lastAttrName.endsWith(':')) {
      const scanned = scanParens(this.#source, start);
      this.#offset = scanned.value.span.end;
      const token: Token = { type: 'explicit-expr', span: scanned.value.span, group: scanned.value };
      return scanned.diagnostics.length === 0
        ? ok(token)
        : withDiagnostics(token, scanned.diagnostics);
    }

    // An unquoted value is not an attribute name: emit it as text and let SDD-05
    // own the diagnostic (FUD0056 lives there).
    if (this.#afterAttrEq) return this.#scanUnquotedValue();

    return this.#scanAttrName();
  }

  #scanWhitespace(): ParseResult<Token> {
    const start = this.#offset;
    let i = start;
    while (i < this.#length) {
      const c = this.#at(i);
      if (c === undefined || !WHITESPACE.test(c)) break;
      i++;
    }
    return this.#emit('whitespace', start, i);
  }

  #scanAttrName(): ParseResult<Token> {
    const start = this.#offset;
    let i = start;
    while (i < this.#length) {
      const c = this.#at(i);
      if (c === undefined || ATTR_NAME_STOP.has(c)) break;
      if (c === '/' && this.#at(i + 1) === '>') break;
      i++;
    }
    // Always consume at least one character: the cursor must progress.
    if (i === start) i = start + 1;
    const name = this.#source.slice(start, i);
    this.#offset = i;
    this.#transition = (): void => {
      this.#lastAttrName = name;
    };
    return ok({ type: 'attr-name', span: span(start, i), name });
  }

  #scanUnquotedValue(): ParseResult<Token> {
    const start = this.#offset;
    let i = start;
    while (i < this.#length) {
      const c = this.#at(i);
      if (c === undefined || WHITESPACE.test(c) || c === '>') break;
      if (c === '/' && this.#at(i + 1) === '>') break;
      i++;
    }
    if (i === start) i = start + 1;
    this.#transition = (): void => {
      this.#afterAttrEq = false;
    };
    return this.#emit('text', start, i);
  }

  // ------------------------------------------------------------------
  // Attribute values (interpolation is live: decision 20)
  // ------------------------------------------------------------------

  #scanAttrValue(): ParseResult<Token> {
    const start = this.#offset;
    const c = this.#at(start);
    if (c === this.#quote) {
      this.#transition = (): void => {
        this.#inAttrValue = false;
      };
      return this.#emit('attr-quote-close', start, start + 1);
    }
    if (c === '@' && !this.#isLiteralAt(start)) return this.#scanAt();

    let i = start;
    while (i < this.#length) {
      const ch = this.#at(i);
      if (ch === undefined || ch === this.#quote) break;
      if (ch === '@') {
        if (!this.#isLiteralAt(i)) break;
        i++;
        continue;
      }
      i++;
    }
    if (i >= this.#length) {
      this.#transition = (): void => {
        this.#inAttrValue = false;
      };
      return this.#emitWith('text', start, this.#length, [
        this.#error('FUD0015', 'unterminated attribute value', emptySpan(this.#length)),
      ]);
    }
    return this.#emit('text', start, i);
  }

  // ------------------------------------------------------------------
  // Raw bodies: script (opaque), style (css placeholder), title/textarea (RCDATA)
  // ------------------------------------------------------------------

  /** Decides and records the mode a start tag opens, once its `>` is consumed. */
  #openBody(tag: string): void {
    const lower = tag.toLowerCase();
    const mode = this.#modes.current;

    if (OPAQUE_RAW.has(lower)) {
      this.#modes.push('raw');
      this.#modeOwners.push({ name: lower, owns: true });
      this.#rawElement = lower;
      this.#rawRazor = false;
      return;
    }
    if (lower === 'style') {
      this.#modes.push('css');
      this.#modeOwners.push({ name: lower, owns: true });
      this.#rawElement = lower;
      this.#rawRazor = false;
      return;
    }
    if (RCDATA_RAW.has(lower)) {
      this.#modes.push('raw');
      this.#modeOwners.push({ name: lower, owns: true });
      this.#rawElement = lower;
      this.#rawRazor = true;
      return;
    }
    // Only the ROOT svg/math pushes: nested ones stay in the foreign mode.
    if ((lower === 'svg' || lower === 'math') && mode === 'html') {
      this.#modes.push(lower);
      this.#modeOwners.push({ name: lower, owns: true });
      return;
    }
    // A nested element sharing the owner's name must swallow its own close tag,
    // or `</svg>` on an inner <svg> would pop the outer one's mode.
    const owner = this.#modeOwners[this.#modeOwners.length - 1];
    if (owner !== undefined && owner.name === lower) {
      this.#modeOwners.push({ name: lower, owns: false });
    }
  }

  #scanRawBody(): ParseResult<Token> {
    const start = this.#offset;
    const element = this.#rawElement;

    if (this.#isCloseTagAt(start, element)) return this.#scanCloseTag();

    if (!this.#rawRazor) {
      const close = this.#findCloseTag(start, element);
      if (close === -1) {
        // Pop as well, so the stack stays balanced for whatever runs after EOF.
        this.#transition = (): void => {
          this.#modeOwners.pop();
          this.#modes.pop(start);
          this.#rawElement = '';
          this.#rawRazor = false;
        };
        this.#offset = this.#length;
        return withDiagnostics(
          { type: 'raw-text', span: span(start, this.#length), element },
          [this.#error('FUD0014', `unterminated <${element}> element`, emptySpan(this.#length))],
        );
      }
      this.#offset = close;
      return ok({ type: 'raw-text', span: span(start, close), element });
    }

    // RCDATA: text and `@` atoms, no nested tags (§4.6). An unterminated one is
    // the same FUD0014 as an opaque body: §4.10 scopes the code to raw elements,
    // not to <script> alone.
    if (this.#findCloseTag(start, element) === -1) {
      this.#transition = (): void => {
        this.#modeOwners.pop();
        this.#modes.pop(start);
        this.#rawElement = '';
        this.#rawRazor = false;
      };
      return this.#emitWith('text', start, this.#length, [
        this.#error('FUD0014', `unterminated <${element}> element`, emptySpan(this.#length)),
      ]);
    }

    const c = this.#at(start);
    if (c === '@' && !this.#isLiteralAt(start)) return this.#scanAt();
    let i = start;
    while (i < this.#length) {
      const ch = this.#at(i);
      if (ch === undefined) break;
      if (ch === '<' && this.#isCloseTagAt(i, element)) break;
      if (ch === '@' && !this.#isLiteralAt(i)) break;
      i++;
    }
    if (i === start) i = start + 1;
    return this.#emit('text', start, i);
  }

  /** True when a `</element` close tag starts exactly at `i`. */
  #isCloseTagAt(i: number, element: string): boolean {
    if (element === '') return false;
    if (!this.#matches(i, `</${element}`)) return false;
    const after = this.#at(i + 2 + element.length);
    return after === undefined || after === '>' || WHITESPACE.test(after) || after === '/';
  }

  #findCloseTag(from: number, element: string): number {
    for (let i = from; i < this.#length; i++) {
      if (this.#at(i) === '<' && this.#isCloseTagAt(i, element)) return i;
    }
    return -1;
  }
}

/** Convenience: tokenize a whole source eagerly. Mainly for tests and tooling. */
export function tokenize(source: string, baseMode: Mode = 'html'): ParseResult<readonly Token[]> {
  const lexer = new Lexer(source, baseMode);
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  for (;;) {
    const result = lexer.next();
    diagnostics.push(...result.diagnostics);
    if (result.value.type === 'eof') break;
    tokens.push(result.value);
  }
  return diagnostics.length === 0 ? ok(tokens) : withDiagnostics(tokens, diagnostics);
}
