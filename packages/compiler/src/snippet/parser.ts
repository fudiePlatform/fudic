/**
 * The snippet parser (SDD-29 §4.1, §4.7). It implements SDD-05's
 * `AtConstructParser.parseSnippet`: SDD-05 resolves an `@` to a snippet directive (SDD-04)
 * and hands the parse over here; this module reads the Razor punctuation with the balancer
 * (SDD-02) and, for `@snippet`, fills the `{ … }` body by recursing back through
 * `ctx.parseContentUntil` — the same seam SDD-06 and SDD-21 use.
 *
 * It owns the punctuation and nothing else: `(`, `)`, `{`, `}`, the name, the namespace dot
 * and the commas that separate arguments. What is INSIDE the signature is a TypeScript
 * parameter list and belongs to Oxc (`signature.ts`); what is inside an argument is a JS
 * expression and stays a span. And WHERE a call may appear, whether the name resolves and
 * whether the arity is right are questions about the whole graph of files, which is
 * `check.ts`.
 *
 * Never throws. A missing name, missing parentheses, a missing `{`/`}` all degrade to a
 * partial node plus a located diagnostic, and the cursor always advances.
 */

import { type Span, span, emptySpan } from '../types/index.js';
import { type Diagnostic, errorDiag } from '../types/index.js';
import { type ParseResult, ok, withDiagnostics } from '../types/index.js';
import { type LexRegion, scanBalanced, scanParens } from '../balancer/index.js';
import type { SnippetDirective } from '../at/index.js';
import type { HtmlContent, HtmlParseContext } from '../html/index.js';
import type { Token } from '../lexer/index.js';
import type {
  NamedArg,
  PositionalArg,
  RenderArg,
  RenderCallNode,
  SnippetDeclNode,
  SnippetNode,
} from './nodes.js';

/** A `@snippet` / `@render` whose name is missing, or is not `[A-Za-z_][A-Za-z0-9_]*`. */
const FUD_BAD_NAME = 'FUD0820';
/** A signature or an argument list with no closing parenthesis. */
const FUD_BAD_SIGNATURE = 'FUD0821';
/** A positional argument written after a nominal one (decision 12). */
const FUD_POSITIONAL_AFTER_NAMED = 'FUD0832';
/** An `@` inside the header of a `@render` (decision 13). */
const FUD_AT_IN_HEADER = 'FUD0833';
/**
 * The `{ … }` of a `@snippet` reuses SDD-06's block diagnostics, exactly as `@section` does:
 * same rule, same message, so an author who forgets a brace reads one wording and not three.
 */
const FUD_MISSING_BLOCK = 'FUD0071';
const FUD_UNCLOSED_BLOCK = 'FUD0072';

const WHITESPACE = /\s/u;
/**
 * A snippet name. Narrower than a tag name (decision 41, which allows hyphens) and narrower
 * than a JS identifier (no `$`, no unicode): a hyphen would be ambiguous against a
 * subtraction in a `@render` header, and the name is projected verbatim as a TypeScript
 * function name (§4.11), where `$` is reserved to the emit (SDD-15 §4.7).
 */
const SNIPPET_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;
/** The run a name is read from: wider than `SNIPPET_NAME`, so `my-card` is REPORTED, not cut. */
const NAME_RUN = /[A-Za-z0-9_$-]/u;

/** EOF-safe character read: `''` past the end, so no scanner needs an undefined branch. */
function charAt(source: string, i: number): string {
  return source.charAt(i);
}

/**
 * Skip whitespace and Razor comments at offset level — the same notion of trivia SDD-06
 * applies around every `(`/`{` (decision 10).
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

/** The `}` that closes a `@snippet` body is its only boundary (mirrors SDD-06 §4.6). */
function isBlockEnd(next: Token): boolean {
  return next.type === 'block-end';
}

/** Trim whitespace off both ends of `sp`, so an argument's span covers its expression alone. */
function trimmed(source: string, sp: Span): Span {
  let start = sp.start;
  let end = sp.end;
  while (start < end && WHITESPACE.test(charAt(source, start))) start++;
  while (end > start && WHITESPACE.test(charAt(source, end - 1))) end--;
  return span(start, end);
}

class SnippetParser {
  readonly #ctx: HtmlParseContext;
  readonly #source: string;
  readonly #diagnostics: Diagnostic[] = [];

  constructor(ctx: HtmlParseContext) {
    this.#ctx = ctx;
    this.#source = ctx.source;
  }

  /**
   * `parseSnippet` receives the KEYWORD span (SDD-04 excludes the `@`), and the node's span
   * must cover `@snippet …`, so the construct starts one character earlier. Not tested for:
   * the `@` is there by construction — SDD-05 only resolves a trigger it read from one.
   */
  parse(directive: SnippetDirective, keywordSpan: Span): ParseResult<SnippetNode> {
    const start = keywordSpan.start - 1;
    const node =
      directive === 'snippet'
        ? this.#parseDecl(keywordSpan, start)
        : this.#parseCall(keywordSpan, start);
    return this.#diagnostics.length === 0 ? ok(node) : withDiagnostics(node, this.#diagnostics);
  }

  #error(code: string, message: string, at: Span): void {
    this.#diagnostics.push(errorDiag(code, message, at));
  }

  /** `@snippet name(firma) { markup }`. */
  #parseDecl(keywordSpan: Span, start: number): SnippetDeclNode {
    const name = this.#name(keywordSpan.end, '@snippet');
    const parens = this.#parens(name.span.end, '@snippet');
    const bodyFrom = parens?.span.end ?? name.span.end;
    const block = this.#block(bodyFrom);
    const signature = parens?.inner ?? emptySpan(bodyFrom);
    return {
      type: 'snippet',
      span: span(start, block?.span.end ?? bodyFrom),
      name: name.name,
      nameSpan: name.span,
      keywordSpan,
      signature,
      signatureSpan: parens?.span ?? emptySpan(bodyFrom),
      children: block?.body ?? [],
      bodySpan: block?.span ?? emptySpan(bodyFrom),
    };
  }

  /** `@render (ns.)?name(args)`. */
  #parseCall(keywordSpan: Span, start: number): RenderCallNode {
    const first = this.#name(keywordSpan.end, '@render');
    // A `.` ADJACENT to the name opens the namespace form. Adjacency is the boundary rule
    // everywhere in this grammar (decision 101), and here it also keeps `@render card` and
    // the sentence that might follow it apart.
    const dotted =
      charAt(this.#source, first.span.end) === '.'
        ? this.#name(first.span.end + 1, '@render')
        : undefined;
    const name = dotted ?? first;
    const parens = this.#parens(name.span.end, '@render');
    const args = parens === undefined ? [] : this.#args(parens.inner, parens.regions);
    return {
      type: 'render',
      span: span(start, parens?.span.end ?? name.span.end),
      ...(dotted !== undefined
        ? { namespace: first.name, namespaceSpan: first.span }
        : {}),
      name: name.name,
      nameSpan: name.span,
      keywordSpan,
      args,
      argsSpan: parens?.span ?? emptySpan(name.span.end),
    };
  }

  /**
   * The name after the keyword, or after the namespace dot.
   *
   * Read as a RUN of name characters and then validated, rather than cut at the first
   * character that does not belong: `@render my-card(…)` is one mistake to report and not a
   * call to `my` followed by the text `-card(…)`.
   */
  #name(from: number, label: string): { name: string; span: Span } {
    const at = skipTrivia(this.#source, from);
    let i = at;
    while (i < this.#source.length && NAME_RUN.test(charAt(this.#source, i))) i++;
    const text = this.#source.slice(at, i);
    if (SNIPPET_NAME.test(text)) return { name: text, span: span(at, i) };
    const where = i === at ? emptySpan(at) : span(at, i);
    this.#error(
      FUD_BAD_NAME,
      text === ''
        ? `${label} expects a name`
        : `"${text}" is not a valid snippet name: letters, digits and underscore, never a hyphen`,
      where,
    );
    return { name: '', span: where };
  }

  /**
   * The mandatory `( … )` after the name. Leaves the lexer past it. `undefined` when there is
   * none, and then the cursor stays where the name ended, so the parser resumes in place.
   */
  #parens(
    from: number,
    label: string,
  ): { inner: Span; span: Span; regions: readonly LexRegion[] } | undefined {
    const at = skipTrivia(this.#source, from);
    if (charAt(this.#source, at) !== '(') {
      this.#error(FUD_BAD_SIGNATURE, `${label} requires parentheses`, emptySpan(at));
      return undefined;
    }
    const scanned = scanParens(this.#source, at);
    if (scanned.diagnostics.length > 0) this.#diagnostics.push(...scanned.diagnostics);
    this.#ctx.lexer.seekTo(scanned.value.span.end);
    return {
      inner: scanned.value.inner,
      span: scanned.value.span,
      regions: scanned.value.regions,
    };
  }

  /** `{ html_content* }`. `undefined` ⇒ FUD0071; otherwise the body plus the braces' span. */
  #block(from: number): { body: readonly HtmlContent[]; span: Span } | undefined {
    const at = skipTrivia(this.#source, from);
    if (charAt(this.#source, at) !== '{') {
      this.#error(FUD_MISSING_BLOCK, "expected '{' to open the block body", emptySpan(at));
      return undefined;
    }
    const lexer = this.#ctx.lexer;
    lexer.seekTo(at + 1);
    const body = this.#ctx.parseContentUntil(isBlockEnd).value;
    const closing = lexer.peek();
    if (closing.type !== 'block-end') {
      this.#error(FUD_UNCLOSED_BLOCK, "unclosed block: expected '}'", span(at, at + 1));
      return { body, span: span(at, lexer.offset) };
    }
    const consumed = lexer.next();
    this.#diagnostics.push(...consumed.diagnostics);
    return { body, span: span(at, closing.span.end) };
  }

  /**
   * The argument list: positionals first, nominals after (decision 12).
   *
   * Split at the commas that are at DEPTH ZERO, which is the only reading that survives real
   * arguments: a comma inside a string, an object literal, an array or a nested call does not
   * separate anything. Nested groups are jumped with the balancer and the opaque regions the
   * enclosing scan already walked are reused instead of re-lexing them.
   */
  #args(inner: Span, regions: readonly LexRegion[]): readonly RenderArg[] {
    this.#rejectAt(inner, regions);
    const args: RenderArg[] = [];
    let seenNamed = false;
    for (const piece of this.#split(inner, regions)) {
      const arg = this.#arg(piece);
      if (arg === undefined) continue;
      if (arg.type === 'named-arg') seenNamed = true;
      else if (seenNamed) {
        this.#error(
          FUD_POSITIONAL_AFTER_NAMED,
          'a positional argument cannot follow a named one: positionals first, names after',
          arg.span,
        );
      }
      args.push(arg);
    }
    return args;
  }

  /**
   * The `@` written inside a header (decision 13). The `@render` already made the transition
   * to JS mode, exactly as `@if (cond)` does; a second one there is a habit borrowed from
   * attributes, where the default is literal text.
   */
  #rejectAt(inner: Span, regions: readonly LexRegion[]): void {
    const opaque = new Map(regions.map((r) => [r.span.start, r.span.end] as const));
    let i = inner.start;
    while (i < inner.end) {
      const skipTo = opaque.get(i);
      if (skipTo !== undefined) {
        i = skipTo;
        continue;
      }
      if (charAt(this.#source, i) === '@') {
        this.#error(
          FUD_AT_IN_HEADER,
          'no @ inside a @render header: the arguments are already JavaScript',
          span(i, i + 1),
        );
        return;
      }
      i++;
    }
  }

  /** The pieces between top-level commas. An empty list for an empty `( )`. */
  #split(inner: Span, regions: readonly LexRegion[]): readonly Span[] {
    const opaque = new Map(regions.map((r) => [r.span.start, r.span.end] as const));
    const out: Span[] = [];
    let from = inner.start;
    let i = inner.start;
    while (i < inner.end) {
      const skipTo = opaque.get(i);
      if (skipTo !== undefined) {
        i = skipTo;
        continue;
      }
      const char = charAt(this.#source, i);
      if (char === '(' || char === '[' || char === '{') {
        const closer = char === '(' ? ')' : char === '[' ? ']' : '}';
        const group = scanBalanced(this.#source, i, closer);
        this.#diagnostics.push(...group.diagnostics);
        i = group.value.span.end;
        continue;
      }
      if (char === ',') {
        out.push(span(from, i));
        from = i + 1;
      }
      i++;
    }
    out.push(span(from, inner.end));
    // A single empty piece is `( )`, not an argument. A LATER empty piece is a trailing or
    // doubled comma, which the expression is empty for, and `check.ts` reports as arity.
    return out.length === 1 && trimmed(this.#source, out[0]!).start === out[0]!.end ? [] : out;
  }

  /** One argument: `name: expr` when it opens with an identifier and a colon, else a value. */
  #arg(piece: Span): PositionalArg | NamedArg | undefined {
    const value = trimmed(this.#source, piece);
    if (value.start === value.end) return undefined;
    const label = this.#namedLabel(value);
    if (label === undefined) return { type: 'positional-arg', span: value, value };
    return {
      type: 'named-arg',
      span: value,
      name: label.name,
      nameSpan: label.span,
      value: trimmed(this.#source, span(label.colon + 1, value.end)),
    };
  }

  /**
   * The `name:` a nominal argument opens with, or `undefined`.
   *
   * The colon must be the FIRST thing after the identifier for this to be a label: `x ? a : b`
   * opens with `x` and a `?`, and `a.b : c` is not a form at all. `::` never appears in JS,
   * and `?.` is caught by the same rule — so nothing else in the language can be mistaken
   * for one.
   */
  #namedLabel(value: Span): { name: string; span: Span; colon: number } | undefined {
    let i = value.start;
    while (i < value.end && NAME_RUN.test(charAt(this.#source, i))) i++;
    const name = this.#source.slice(value.start, i);
    if (!SNIPPET_NAME.test(name)) return undefined;
    const colon = skipTrivia(this.#source, i);
    if (charAt(this.#source, colon) !== ':' || colon >= value.end) return undefined;
    return { name, span: span(value.start, i), colon };
  }
}

/**
 * Parse a snippet construct. SDD-05 calls this after resolving the `@` and positioning the
 * lexer just past the keyword; on return the lexer sits past the whole construct.
 */
export function parseSnippet(
  ctx: HtmlParseContext,
  directive: SnippetDirective,
  keywordSpan: Span,
): ParseResult<SnippetNode> {
  return new SnippetParser(ctx).parse(directive, keywordSpan);
}
