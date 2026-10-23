/**
 * The `@code { … }` block parser (SDD-08). SDD-05 resolves the trigger to
 * `kind: 'code-block'` and delegates here through `AtConstructParser.parseCodeBlock`.
 *
 * The body is JS, not HTML, so this module never touches `ctx.parseContentUntil`:
 * it delimits the block with the SDD-02 balancer, splits the body into JS chunks, and
 * repositions the lexer past the closing `}` with `seekTo`.
 *
 * It does NOT parse or validate the JS (Oxc, SDD-11) and does not police where the block
 * may appear (SDD-10). It never throws: broken input degrades the value and emits a located
 * diagnostic, and the cursor always moves forward.
 *
 * Two things it does police, because nobody downstream can: a Razor comment written in
 * here is FUD0114 (decision 35.a, BUG-13) — the body is JavaScript, `@* … *@` is not, and
 * the balancer is told to treat it as opaque so a comment can never decide where the
 * block ends — and a `@server` / `@client` region is FUD1110 (SDD-60 §3.14): the `@code` is
 * browser code, all of it. The region's wrapper is left out of the chunks and its content
 * read as if it had none, so nothing else is reported because of it.
 */

import { type Span, span, emptySpan } from '../types/index.js';
import type { Diagnostic } from '../types/index.js';
import { FUD0110, FUD0114, FUD1110 } from '@fudic/diagnostics';
import { type ParseResult, ok, withDiagnostics } from '../types/index.js';
import { type BalancedGroup, type LexRegion, scanBraces, scanParens } from '../balancer/index.js';
import type { HtmlParseContext } from '../html/index.js';
import type { CodeBlockNode, NeutralJs } from './nodes.js';

/**
 * The body of `@code` is JavaScript, and JavaScript has its own two comment forms.
 * A Razor comment exists to comment WITHOUT publishing — which is what it buys in markup
 * and in CSS, where the native comment does reach the browser. In JS the bundler already
 * drops `//`, so `@* … *@` adds nothing here except text the JS parser cannot read.
 */
const RAZOR_COMMENTS: Readonly<{ razorComments: true }> = { razorComments: true };

const WHITESPACE = /\s/u;
const NON_WHITESPACE = /\S/u;
const IDENT_START = /[\p{ID_Start}$_]/u;
const IDENT_PART = /[\p{ID_Continue}$]/u;

/** The two retired region markers (SDD-60 §3.14). Any other `@…` is JS (a decorator). */
type MarkerName = 'server' | 'client';

/** First offset >= `from` (and <= `limit`) that is not whitespace. */
function skipWhitespace(source: string, from: number, limit: number): number {
  let i = from;
  while (i < limit) {
    const c = source[i];
    if (c === undefined || !WHITESPACE.test(c)) break;
    i++;
  }
  return i;
}

/** End offset of the identifier starting at `from`, or `from` when there is none. */
function identifierEnd(source: string, from: number): number {
  const first = source[from];
  if (first === undefined || !IDENT_START.test(first)) return from;
  let i = from + 1;
  for (;;) {
    const c = source[i];
    if (c === undefined || !IDENT_PART.test(c)) break;
    i++;
  }
  return i;
}

/**
 * A marker is only a marker with a word boundary after it: `@server(`, `@server {`
 * or `@server` followed by whitespace (§4.2). Anything else (`@server;`) stays JS.
 */
function opensMarker(follow: string | undefined): boolean {
  return follow === '(' || follow === '{' || (follow !== undefined && WHITESPACE.test(follow));
}

/**
 * Cursor over the opaque lexical regions the balancer already walked (strings,
 * templates, comments, regex). Reusing them is what keeps SDD-08 free of a second
 * JS lexer: the regions arrive sorted, so a single forward pointer suffices.
 */
class RegionCursor {
  readonly #regions: readonly LexRegion[];
  #index = 0;

  constructor(regions: readonly LexRegion[]) {
    this.#regions = regions;
  }

  /**
   * If `offset` falls inside an opaque region, the offset just past it; otherwise
   * `offset` itself. Always strictly greater than `offset` when it skips, so the
   * caller's loop cannot stall.
   */
  skipFrom(offset: number): number {
    for (
      let region = this.#regions[this.#index];
      region !== undefined;
      region = this.#regions[this.#index]
    ) {
      if (region.span.end > offset) {
        return region.span.start <= offset ? region.span.end : offset;
      }
      this.#index++;
    }
    return offset;
  }
}

/**
 * Splits one `@code` body into its JS chunks. Walks the body at TOP LEVEL only: opaque
 * regions come pre-computed from the balancer, and nested `(`/`[`/`{` groups are
 * counted so a `@server` written inside them is not mistaken for a region marker.
 *
 * A retired `@server { … }` / `@client { … }` is FUD1110 once, on its marker, and the
 * splitter goes on INSIDE it as top level: its content is read as if it had no wrapper, so a
 * region nested in another is reported on its own, and the marker, its `(…)` and its braces
 * never reach a chunk — Oxc sees plain JS and has nothing to add (SDD-60 §3.14).
 */
class BodySplitter {
  readonly #source: string;
  readonly #end: number;
  readonly #regions: RegionCursor;
  readonly #parts: NeutralJs[] = [];
  readonly #diagnostics: Diagnostic[] = [];
  /** The `}` of every region still open, innermost last: each one cuts a chunk. */
  readonly #closers: number[] = [];

  /** Start of the chunk currently being accumulated. */
  #chunkStart: number;
  /** Nesting depth of plain JS groups. Markers are only recognized at depth 0. */
  #depth = 0;
  #offset: number;

  constructor(source: string, body: Span, regions: readonly LexRegion[]) {
    this.#source = source;
    this.#end = body.end;
    this.#regions = new RegionCursor(regions);
    this.#chunkStart = body.start;
    this.#offset = body.start;
  }

  get diagnostics(): readonly Diagnostic[] {
    return this.#diagnostics;
  }

  split(): readonly NeutralJs[] {
    while (this.#offset < this.#end) {
      if (this.#offset === this.#closers.at(-1)) {
        this.#closers.pop();
        this.#closeChunk(this.#offset);
        this.#offset++;
        this.#chunkStart = this.#offset;
        continue;
      }
      const skipped = this.#regions.skipFrom(this.#offset);
      if (skipped !== this.#offset) {
        this.#offset = skipped;
        continue;
      }
      this.#step();
    }
    this.#closeChunk(this.#end);
    return this.#parts;
  }

  /** One character of top-level body. Always advances `#offset`. */
  #step(): void {
    const c = this.#source[this.#offset];
    if (c === '(' || c === '[' || c === '{') {
      this.#depth++;
      this.#offset++;
      return;
    }
    if (c === ')' || c === ']' || c === '}') {
      // Clamped: an unterminated block hands us a body with stray closers, and a
      // negative depth would silently disable marker detection for the rest of it.
      this.#depth = Math.max(0, this.#depth - 1);
      this.#offset++;
      return;
    }
    if (c === '@' && this.#depth === 0) {
      this.#offset = this.#at(this.#offset);
      return;
    }
    this.#offset++;
  }

  /**
   * An `@` at top level. Returns where scanning resumes. Only `@server` / `@client`
   * are markers; every other `@…` (a TS decorator, say) is left to Oxc.
   */
  #at(atOffset: number): number {
    const identStart = atOffset + 1;
    const identEnd = identifierEnd(this.#source, identStart);
    const name = this.#source.slice(identStart, identEnd);
    if ((name !== 'server' && name !== 'client') || !opensMarker(this.#source[identEnd])) {
      // Not a marker: skip the identifier as JS. With no identifier at all `identEnd`
      // is `atOffset + 1`, so the cursor still advances past the bare `@`.
      return identEnd;
    }
    return this.#marker(atOffset, identEnd, name);
  }

  /**
   * A confirmed `@server` / `@client`: FUD1110 on the marker, which leaves the chunks along
   * with its parameter list. With its `{`, scanning resumes inside it and its `}` is held
   * as a closer; without one there is nothing to unwrap.
   */
  #marker(atOffset: number, identEnd: number, name: MarkerName): number {
    this.#closeChunk(atOffset);
    this.#diagnostics.push(FUD1110({ span: span(atOffset, identEnd), region: name }));
    let cursor = identEnd;
    if (this.#source[cursor] === '(') {
      const parameters = scanParens(this.#source, cursor);
      this.#diagnostics.push(...parameters.diagnostics);
      cursor = parameters.value.span.end;
    }

    // `skipWhitespace` stops at the body end, where the character is the `}` closing
    // the `@code` block (or nothing at all), so neither can be mistaken for the brace.
    const brace = skipWhitespace(this.#source, cursor, this.#end);
    if (this.#source[brace] !== '{') {
      this.#chunkStart = cursor;
      return cursor;
    }

    const group = scanBraces(this.#source, brace, RAZOR_COMMENTS);
    this.#diagnostics.push(...group.diagnostics);
    const inner = group.value.inner;
    if (this.#source[inner.end] === '}') this.#closers.push(inner.end);
    this.#chunkStart = inner.start;
    return inner.start;
  }

  /** Emit the pending chunk `[#chunkStart, upTo)`, unless it is blank. */
  #closeChunk(upTo: number): void {
    if (upTo <= this.#chunkStart) return;
    const at = span(this.#chunkStart, upTo);
    this.#chunkStart = upTo;
    if (!NON_WHITESPACE.test(this.#source.slice(at.start, at.end))) return;
    this.#parts.push({ type: 'neutral-js', span: at, js: at });
  }
}

/**
 * Parse a `@code { … }` block. `ctx.lexer` sits right after `keywordSpan.end` (`code`).
 * Delimits the body with `scanBraces`, then splits it into JS chunks. Never throws; leaves
 * the lexer past the closing `}`.
 * Signature-compatible with `AtConstructParser.parseCodeBlock`.
 */
export function parseCodeBlock(
  ctx: HtmlParseContext,
  keywordSpan: Span,
): ParseResult<CodeBlockNode> {
  const source = ctx.source;
  // SDD-04's `keywordSpan` covers `code` only, never the leading `@`, but the node
  // owns the whole atom (§4.1). The `@` is the character before it by construction;
  // the guard keeps a hand-built span from producing a bogus start offset.
  const start = source[keywordSpan.start - 1] === '@' ? keywordSpan.start - 1 : keywordSpan.start;

  const brace = skipWhitespace(source, keywordSpan.end, source.length);
  if (source[brace] !== '{') {
    const degraded: CodeBlockNode = {
      type: 'code',
      span: span(start, keywordSpan.end),
      parts: [],
      regions: [],
    };
    return withDiagnostics(degraded, [FUD0110({ span: emptySpan(brace), name: 'code' })]);
  }

  const block = scanBraces(source, brace, RAZOR_COMMENTS);
  const group: BalancedGroup = block.value;
  const splitter = new BodySplitter(source, group.inner, group.regions);
  const parts = splitter.split();

  // The lexer resumes in html mode right after the block: `seekTo` is forward-only
  // and leaves the mode stack alone, which is exactly what SDD-05 expects back.
  ctx.lexer.seekTo(group.span.end);

  // The regions travel with the node (BUG-30 §4.4): the balancer walked the whole body, and
  // a fact computed about the source is published, not recomputed by whoever needs it next.
  const node: CodeBlockNode = {
    type: 'code',
    span: span(start, group.span.end),
    parts,
    regions: group.regions,
  };
  const diagnostics = [
    ...block.diagnostics,
    ...razorCommentErrors(group.regions),
    ...splitter.diagnostics,
  ];
  return diagnostics.length === 0 ? ok(node) : withDiagnostics(node, diagnostics);
}

/**
 * One `FUD0114` per Razor comment written anywhere in the block (decision 35.a).
 *
 * The balancer walked the WHOLE body — the inside of a retired `@server` / `@client`
 * included, since it counts braces rather than recursing — so a single pass over its regions
 * covers every position, and covers them identically. The text is not carved out
 * of the chunk: SDD-08 recovers the same way from `FUD0110`, leaving the offending source
 * where the author wrote it and saying so with a span.
 */
function razorCommentErrors(regions: readonly LexRegion[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const region of regions) {
    if (region.kind !== 'razor-comment') continue;
    out.push(FUD0114({ span: region.span }));
  }
  return out;
}
