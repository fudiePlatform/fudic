/**
 * The control-flow construct parser (SDD-06). It implements SDD-05's
 * `AtConstructParser.parseControl`: SDD-05 resolves an `@` to a control keyword and
 * hands the parse over here; this module reads the `( … )` header with the balancer
 * (SDD-02) and fills the `{ … }` body by recursing back through
 * `ctx.parseContentUntil` — so an `@if` inside a `@foreach` inside a `<p>` works
 * without either side knowing the other's grammar.
 *
 * SDD-06 owns the Razor punctuation only: `(`, `)`, `{`, `}`, `else`, `case`,
 * `default`, `:`. Header and `case` test contents are opaque JS for Oxc (SDD-11).
 *
 * Never throws. A missing `(`/`{`/`}`, an orphan `else` or a `case` with no `:` all
 * degrade to a partial node plus a located diagnostic, and the cursor always advances.
 */

import { type Span, span, emptySpan } from '../types/index.js';
import { type Diagnostic, errorDiag } from '../types/index.js';
import { type ParseResult, ok, withDiagnostics } from '../types/index.js';
import { scanBrackets, scanBraces, scanParens } from '../balancer/index.js';
import type { ControlKeyword } from '../at/index.js';
import type { HtmlContent, HtmlParseContext } from '../html/index.js';
import type { Token } from '../lexer/index.js';
import type {
  ConditionalBranch,
  ControlHeader,
  ControlNode,
  IfNode,
  SwitchCase,
  SwitchNode,
} from './nodes.js';

const WHITESPACE = /\s/u;
const IDENT_START = /[\p{ID_Start}$_]/u;
const IDENT_PART = /[\p{ID_Continue}$]/u;
const DIGIT = /[0-9]/u;
/** The two line terminators a string or a regex literal may not cross. */
const LINE_BREAK = /[\r\n]/u;
const ASCII_LETTER = /[a-zA-Z]/u;

/**
 * `String.prototype.charAt` rather than indexing: it yields `''` past the end instead
 * of `undefined`, so every scanner below is EOF-safe without an undefined branch that
 * no input could ever reach.
 */
function charAt(source: string, i: number): string {
  return source.charAt(i);
}

/**
 * Skip whitespace and Razor comments at offset level. Decision 10 allows both between
 * a `}` and its `else`; applying the same rule around every `(`/`{` keeps one notion of
 * trivia across the construct. Trivia skipped here produces no node — it sits between
 * the pieces SDD-06 owns, not inside a body.
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

/** A keyword matched at offset level, with or without its leading `@` (decision 9). */
interface KeywordMatch {
  /** Offset of the `@`, or of the bare keyword when there is none. */
  readonly start: number;
  /** Offset just past the keyword. */
  readonly end: number;
}

/**
 * Match `word` (optionally prefixed by `@`) at `at`, on a word boundary. `else` and the
 * `if` of an `else if` are recognized here, at offset level, because after the closing `}`
 * they are not `at-trigger` tokens the parser is positioned to pull.
 */
function matchKeyword(source: string, at: number, word: string): KeywordMatch | null {
  const start = charAt(source, at) === '@' ? at + 1 : at;
  if (!source.startsWith(word, start)) return null;
  if (IDENT_PART.test(charAt(source, start + word.length))) return null;
  return { start: at, end: start + word.length };
}

/** Span of `[start, end)` with whitespace trimmed off both ends. */
function trimmedSpan(source: string, start: number, end: number): Span {
  let from = start;
  let to = end;
  while (from < to && WHITESPACE.test(charAt(source, from))) from++;
  while (to > from && WHITESPACE.test(charAt(source, to - 1))) to--;
  return span(from, to);
}

/** Degraded header for a construct whose `(` was missing (FUD0070). */
function missingHeader(at: number): ControlHeader {
  const empty = emptySpan(at);
  return { span: empty, inner: empty, closed: false, regions: [] };
}

// ----------------------------------------------------------------------
// The `case` test (§4.5)
// ----------------------------------------------------------------------

/** `'…'` / `"…"`. A backslash escapes the next char; a line break ends it. */
function skipString(source: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < source.length) {
    const c = charAt(source, i);
    if (LINE_BREAK.test(c)) break;
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === quote) return i + 1;
    i++;
  }
  return i;
}

/** A template literal. `${ … }` reopens code context, delegated to the balancer. */
function skipTemplate(source: string, start: number): number {
  let i = start + 1;
  while (i < source.length) {
    const c = charAt(source, i);
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '`') return i + 1;
    if (c === '$' && charAt(source, i + 1) === '{') {
      i = scanBraces(source, i + 1).value.span.end;
      continue;
    }
    i++;
  }
  return source.length;
}

function skipLineComment(source: string, start: number): number {
  let i = start + 2;
  while (i < source.length && !LINE_BREAK.test(charAt(source, i))) i++;
  return i;
}

function skipBlockComment(source: string, start: number): number {
  const close = source.indexOf('*/', start + 2);
  return close === -1 ? source.length : close + 2;
}

/** A regex literal plus its flags. The closing `/` is the first one outside a `[…]` class. */
function skipRegex(source: string, start: number): number {
  let i = start + 1;
  let inClass = false;
  while (i < source.length) {
    const c = charAt(source, i);
    if (LINE_BREAK.test(c)) break;
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) {
      i++;
      while (i < source.length && ASCII_LETTER.test(charAt(source, i))) i++;
      return i;
    }
    i++;
  }
  return i;
}

/** Where a `case` test ends: the JS span, plus the offset just past its label `:`. */
interface CaseTestScan {
  readonly test: Span;
  /** Offset just past the label `:`. */
  readonly end: number;
}

/**
 * Delimit a `case` test (decision 15): any expression, terminated by the first `:` at
 * delimiter depth 0 AND ternary depth 0. Nested `( … )` / `[ … ]` / `{ … }` are handed to
 * the balancer (SDD-02), which also swallows their strings and comments; only the top
 * level is walked here. `?` raises the ternary depth and a `:` lowers it before it can be
 * taken for a label, so `case a ? b : c:` closes on the SECOND colon.
 *
 * `?.` and `??` are not ternaries. A `}` at depth 0 is the `@switch` body's own closing
 * brace: the label is missing (=> null, FUD0075), as is the case at EOF.
 */
function scanCaseTest(source: string, from: number): CaseTestScan | null {
  let i = from;
  let ternary = 0;
  /** Does a `/` here divide, or open a regex literal? (SDD-02 §4.4, simplified.) */
  let valueBefore = false;

  while (i < source.length) {
    const c = charAt(source, i);

    if (WHITESPACE.test(c)) {
      i++;
      continue;
    }

    if (c === '/') {
      const next = charAt(source, i + 1);
      if (next === '/') {
        i = skipLineComment(source, i);
        continue;
      }
      if (next === '*') {
        i = skipBlockComment(source, i);
        continue;
      }
      if (valueBefore) {
        i++;
        valueBefore = false;
        continue;
      }
      i = skipRegex(source, i);
      valueBefore = true;
      continue;
    }

    if (c === "'" || c === '"') {
      i = skipString(source, i, c);
      valueBefore = true;
      continue;
    }

    if (c === '`') {
      i = skipTemplate(source, i);
      valueBefore = true;
      continue;
    }

    if (c === '(' || c === '[' || c === '{') {
      const scan = c === '(' ? scanParens : c === '[' ? scanBrackets : scanBraces;
      const group = scan(source, i).value;
      // Unterminated: the balancer ran to EOF, so no label can follow.
      if (!group.closed) return null;
      i = group.span.end;
      valueBefore = true;
      continue;
    }

    // The brace that closes the `@switch` body: this label never got its `:`.
    if (c === '}') return null;

    if (c === '?') {
      const next = charAt(source, i + 1);
      if (next === '?') {
        i += 2;
        valueBefore = false;
        continue;
      }
      if (next === '.' && !DIGIT.test(charAt(source, i + 2))) {
        i += 2;
        valueBefore = false;
        continue;
      }
      ternary++;
      i++;
      valueBefore = false;
      continue;
    }

    if (c === ':') {
      if (ternary > 0) {
        ternary--;
        i++;
        valueBefore = false;
        continue;
      }
      return { test: trimmedSpan(source, from, i), end: i + 1 };
    }

    if (IDENT_START.test(c) || DIGIT.test(c)) {
      i++;
      while (i < source.length && IDENT_PART.test(charAt(source, i))) i++;
      valueBefore = true;
      continue;
    }

    // Any other operator or punctuator: not value-producing.
    i++;
    valueBefore = false;
  }
  return null;
}

// ----------------------------------------------------------------------
// The parser
// ----------------------------------------------------------------------

/** The `}` that closes a control block is the only boundary of an html_block (§4.6). */
function isBlockEnd(next: Token): boolean {
  return next.type === 'block-end';
}

/** A `case`/`default` body runs up to the next label or to the `@switch`'s `}` (§4.6). */
function isCaseBoundary(next: Token): boolean {
  return next.type === 'switch-label' || next.type === 'block-end';
}

/** The header + body pieces every non-`if` construct is made of. */
interface BlockParts {
  readonly header: ControlHeader;
  readonly body: readonly HtmlContent[];
  /** Offset just past the construct (its closing `}`, or where it degraded). */
  readonly end: number;
}

/**
 * One construct, one instance: the diagnostics accumulate here and are handed back in
 * the `ParseResult`. SDD-05 merges them into the document's; the diagnostics of the body
 * are NOT merged, because `parseContentUntil` already accumulates them on SDD-05's side
 * (a sub-parser that merged them would report each one twice).
 */
class ControlParser {
  readonly #ctx: HtmlParseContext;
  readonly #source: string;
  readonly #diagnostics: Diagnostic[] = [];

  constructor(ctx: HtmlParseContext) {
    this.#ctx = ctx;
    this.#source = ctx.source;
  }

  parse(keyword: ControlKeyword, keywordSpan: Span): ParseResult<ControlNode> {
    const node = this.#dispatch(keyword, keywordSpan, this.#constructStart(keywordSpan));
    return this.#diagnostics.length === 0 ? ok(node) : withDiagnostics(node, this.#diagnostics);
  }

  #dispatch(keyword: ControlKeyword, keywordSpan: Span, start: number): ControlNode {
    switch (keyword) {
      case 'if':
        return this.#parseIf(keywordSpan, start);

      case 'else':
        // A bare `else` in content is plain text to SDD-05 (no trigger, no resolution),
        // so only `@else` ever reaches here — and only with no `@if` to attach to.
        return this.#orphanElse(keywordSpan, start);

      case 'switch':
        return this.#parseSwitch(keywordSpan, start);

      default: {
        const parts = this.#blockParts(keywordSpan);
        const at = span(start, parts.end);
        const { header, body } = parts;
        if (keyword === 'for') return { type: 'for', span: at, header, body };
        if (keyword === 'foreach') return { type: 'foreach', span: at, header, body };
        return { type: 'while', span: at, header, body };
      }
    }
  }

  /**
   * Where the construct starts in source. `parseControl` only receives the keyword span
   * (SDD-04 deliberately excludes the `@` from it), but the node span must cover `@if … }`
   * (§4.1), so the `@` is recovered from the character before the keyword — it is there by
   * construction, since SDD-04 reads the identifier at `@` + 1.
   */
  #constructStart(keywordSpan: Span): number {
    const before = keywordSpan.start - 1;
    return charAt(this.#source, before) === '@' ? before : keywordSpan.start;
  }

  #error(code: string, message: string, at: Span): void {
    this.#diagnostics.push(errorDiag(code, message, at));
  }

  /** Consume one token, keeping the diagnostics the lexer produced reading it. */
  #next(): Token {
    const result = this.#ctx.lexer.next();
    // Unconditional: the tokens SDD-06 consumes itself (`}`, `case`, `default`) carry no
    // diagnostics today, and guarding here would add a branch no input can reach.
    this.#diagnostics.push(...result.diagnostics);
    return result.value;
  }

  #slice(at: Span): string {
    return this.#source.slice(at.start, at.end);
  }

  // ------------------------------------------------------------------
  // Header and block (§4.1)
  // ------------------------------------------------------------------

  /** `( … )` after the keyword. null ⇒ FUD0070; the cursor stays on the keyword's end. */
  #header(from: number): ControlHeader | null {
    const at = skipTrivia(this.#source, from);
    if (charAt(this.#source, at) !== '(') {
      this.#error('FUD0070', "expected '(' after the control keyword", emptySpan(at));
      return null;
    }
    const scanned = scanParens(this.#source, at);
    // An unterminated header is the balancer's FUD0002; it surfaces unrenumbered.
    if (scanned.diagnostics.length > 0) this.#diagnostics.push(...scanned.diagnostics);
    this.#ctx.lexer.seekTo(scanned.value.span.end);
    return scanned.value;
  }

  /** `{ html_content* }`. null ⇒ FUD0071; otherwise the body plus the offset past `}`. */
  #block(from: number): { body: readonly HtmlContent[]; end: number } | null {
    const at = skipTrivia(this.#source, from);
    if (charAt(this.#source, at) !== '{') {
      this.#error('FUD0071', "expected '{' to open the block body", emptySpan(at));
      return null;
    }
    const lexer = this.#ctx.lexer;
    lexer.seekTo(at + 1);
    const body = this.#ctx.parseContentUntil(isBlockEnd).value;
    const closing = lexer.peek();
    if (closing.type !== 'block-end') {
      this.#error('FUD0072', "unclosed block: expected '}'", span(at, at + 1));
      return { body, end: lexer.offset };
    }
    this.#next();
    return { body, end: closing.span.end };
  }

  /** Header + block for `@for`/`@foreach`/`@while`; degradations keep what was read. */
  #blockParts(keywordSpan: Span): BlockParts {
    const header = this.#header(keywordSpan.end);
    if (header === null) {
      return { header: missingHeader(keywordSpan.end), body: [], end: keywordSpan.end };
    }
    const block = this.#block(header.span.end);
    if (block === null) return { header, body: [], end: header.span.end };
    return { header, body: block.body, end: block.end };
  }

  // ------------------------------------------------------------------
  // `@if` / `else` / `else if` (§4.2)
  // ------------------------------------------------------------------

  #parseIf(keywordSpan: Span, start: number): IfNode {
    const first = this.#branch(start, keywordSpan.end);
    // No `(` at all: nothing of the arm is locatable, so the node degrades armless and
    // the rest of the source goes back to SDD-05 as ordinary content.
    if (first === null) return { type: 'if', span: span(start, keywordSpan.end), branches: [] };

    const branches: ConditionalBranch[] = [first.branch];
    let end = first.end;
    let elseBody: readonly HtmlContent[] | null = null;

    for (;;) {
      const otherwise = matchKeyword(this.#source, skipTrivia(this.#source, end), 'else');
      if (otherwise === null) break;
      this.#ctx.lexer.seekTo(otherwise.end);
      end = otherwise.end;

      const chained = matchKeyword(
        this.#source,
        skipTrivia(this.#source, otherwise.end),
        'if',
      );
      if (chained !== null) {
        const arm = this.#branch(otherwise.start, chained.end);
        if (arm === null) break;
        branches.push(arm.branch);
        end = arm.end;
        continue;
      }

      const block = this.#block(otherwise.end);
      if (block !== null) {
        elseBody = block.body;
        end = block.end;
      }
      break;
    }

    const node: IfNode = { type: 'if', span: span(start, end), branches };
    // `elseBody` is OMITTED when there is no final else, never set to undefined
    // (exactOptionalPropertyTypes).
    return elseBody === null ? node : { ...node, elseBody };
  }

  /** One `if` / `else if` arm. `armStart` is where the arm's own span begins. */
  #branch(armStart: number, from: number): { branch: ConditionalBranch; end: number } | null {
    const header = this.#header(from);
    if (header === null) return null;
    const block = this.#block(header.span.end);
    const body = block === null ? [] : block.body;
    const end = block === null ? header.span.end : block.end;
    return {
      branch: { type: 'conditional-branch', span: span(armStart, end), header, body },
      end,
    };
  }

  #orphanElse(keywordSpan: Span, start: number): IfNode {
    const at = span(start, keywordSpan.end);
    this.#error('FUD0073', 'else without a matching @if', at);
    return { type: 'if', span: at, branches: [] };
  }

  // ------------------------------------------------------------------
  // `@switch` (§4.3)
  // ------------------------------------------------------------------

  #parseSwitch(keywordSpan: Span, start: number): SwitchNode {
    const header = this.#header(keywordSpan.end);
    if (header === null) {
      return {
        type: 'switch',
        span: span(start, keywordSpan.end),
        header: missingHeader(keywordSpan.end),
        cases: [],
      };
    }

    const braceAt = skipTrivia(this.#source, header.span.end);
    if (charAt(this.#source, braceAt) !== '{') {
      this.#error('FUD0071', "expected '{' to open the @switch body", emptySpan(braceAt));
      return { type: 'switch', span: span(start, header.span.end), header, cases: [] };
    }

    const lexer = this.#ctx.lexer;
    lexer.seekTo(braceAt + 1);
    // Only inside a switch body do `case`/`default` cut the text run and surface as
    // `switch-label` (SDD-03, decision 80). SDD-06 is what brackets the body.
    lexer.pushSwitchBody();

    const cases: SwitchCase[] = [];
    let end = braceAt + 1;
    for (;;) {
      const token = lexer.peek();
      if (token.type === 'eof') {
        this.#error('FUD0072', "unclosed @switch body: expected '}'", span(braceAt, braceAt + 1));
        end = lexer.offset;
        break;
      }
      if (token.type === 'block-end') {
        this.#next();
        end = token.span.end;
        break;
      }
      if (token.type === 'switch-label') {
        cases.push(this.#switchCase(token.span));
        continue;
      }
      if (token.type === 'razor-comment' || this.#isBlank(token)) {
        this.#next();
        continue;
      }
      this.#discardStrayContent();
    }

    lexer.popSwitchBody();
    return { type: 'switch', span: span(start, end), header, cases };
  }

  /** Whitespace between the `{` and the first label is not "content" (§4.3). */
  #isBlank(token: Token): boolean {
    if (token.type !== 'text' && token.type !== 'whitespace') return false;
    return this.#slice(token.span).trim() === '';
  }

  /**
   * A `@switch` body holds labels and nothing else. Real content before the first label is
   * reported ONCE and discarded up to the next boundary, rather than per token.
   */
  #discardStrayContent(): void {
    const lexer = this.#ctx.lexer;
    const before = lexer.offset;
    this.#ctx.parseContentUntil(isCaseBoundary);
    // `parseContentUntil` also stops on a close tag belonging to an element still open
    // outside the switch; consume one token so the loop can never stall on it.
    if (lexer.offset === before) this.#next();
    this.#error(
      'FUD0074',
      'only case and default labels may appear directly in a @switch body',
      span(before, lexer.offset),
    );
  }

  /** One `case <test>:` / `default:` plus its independent body (decision 14). */
  #switchCase(labelSpan: Span): SwitchCase {
    const lexer = this.#ctx.lexer;
    this.#next(); // the `case` / `default` keyword
    let test: Span | null = null;

    if (this.#slice(labelSpan) === 'case') {
      const scanned = scanCaseTest(this.#source, labelSpan.end);
      if (scanned === null) {
        this.#error('FUD0075', "expected ':' to close the case label", emptySpan(labelSpan.end));
      } else {
        test = scanned.test;
        lexer.seekTo(scanned.end);
      }
    } else {
      const colon = skipTrivia(this.#source, labelSpan.end);
      if (charAt(this.#source, colon) === ':') lexer.seekTo(colon + 1);
      else {
        this.#error('FUD0075', "expected ':' to close the default label", emptySpan(labelSpan.end));
      }
    }

    const body = this.#ctx.parseContentUntil(isCaseBoundary).value;
    const node: SwitchCase = { type: 'switch-case', span: span(labelSpan.start, lexer.offset), body };
    // `test` is OMITTED for `default`, never set to undefined.
    return test === null ? node : { ...node, test };
  }
}

/**
 * Parse a control-flow construct. `keyword` is the resolved control keyword (SDD-04),
 * `keywordSpan` locates it, and `ctx.lexer` sits right after `keywordSpan.end`. Reads the
 * header via the balancer and the body via `ctx.parseContentUntil`, recursing into HTML.
 * Never throws; leaves the lexer just past the construct's closing `}`.
 *
 * Signature-compatible with SDD-05's `AtConstructParser.parseControl`, so the pipeline can
 * inject `{ parseControl, parseCodeBlock }` (parseCodeBlock is SDD-08's).
 */
export function parseControl(
  ctx: HtmlParseContext,
  keyword: ControlKeyword,
  keywordSpan: Span,
): ParseResult<ControlNode> {
  return new ControlParser(ctx).parse(keyword, keywordSpan);
}
