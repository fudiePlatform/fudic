/**
 * The `@` transition rules (SDD-04). SDD-03 resolved every case decidable by one
 * character of lookahead/lookbehind and left `@` + identifier as an `at-trigger`.
 * This module resolves that trigger: it classifies control/`@code` keywords, it
 * recognizes the `@raw( ... )` directive, and it computes the boundary of an
 * implicit expression.
 *
 * It does NOT parse control bodies (SDD-06), `@code` (SDD-08), nor validate the JS
 * (Oxc, SDD-11). Pure functions over `source` + offset: no parser state.
 */

import { type Span, span, emptySpan } from '../types/index.js';
import { type ParseResult, ok, withDiagnostics } from '../types/index.js';
import type { Diagnostic, Node } from '../types/index.js';
import { type LexRegion, scanParens, scanBrackets } from '../balancer/index.js';
import type { JsRegionToken } from '../lexer/index.js';

/** explicit = `@( ... )`; implicit = `@foo.bar`. Same node downstream (SDD-07). */
export type RazorExpressionKind = 'explicit' | 'implicit';

/**
 * A resolved Razor expression atom: a JS expression located in the source, opaque
 * until Oxc validates it (SDD-11). Produced by SDD-04 from an `at-trigger` (implicit)
 * or wrapping an `explicit-expr` token (explicit).
 */
export interface RazorExpression extends Node {
  readonly type: 'razor-expression';
  readonly kind: RazorExpressionKind;
  /** Whole atom span, leading `@` included: `@data.title` / `@(expr)`. */
  readonly span: Span;
  /** The JS expression only (no `@`, no outer `()`): what is handed to Oxc. */
  readonly expr: Span;
  /**
   * Lexical regions inside `expr` (from the balancer): strings, templates, comments,
   * regex. Empty for a plain property path, which has none; the explicit form `@( ... )`
   * and every `( … )` / `[ … ]` link of an implicit chain (decision 100) contribute theirs.
   */
  readonly regions: readonly LexRegion[];
  /**
   * The `.` (or `?.`) written with no name behind it, where the chain stopped
   * (decision 102). NOT part of `span` nor of `expr`: for the emit it is still literal
   * text, so `@data.` keeps printing the dot (decision 2 intact).
   *
   * It is the EDITOR that needs it — the instant completion is asked for is exactly the
   * one where the dot is typed and the name is not — and that is why it travels apart.
   */
  readonly dangling?: Span;
}

/**
 * `@@` => a literal `@` in the output (decision 1). A trivial Razor atom with no
 * payload beyond its span. Lives here, next to `RazorExpression`, because both HTML
 * content (SDD-05) and CSS bodies (SDD-09) produce it: keeping it in either would
 * force the other to import across a module boundary it should not depend on.
 */
export interface AtEscapeNode extends Node {
  readonly type: 'at-escape';
}

/** `@* ... *@`. Kept in the AST for spans/LSP, NOT emitted to output (decision 37). */
export interface RazorCommentNode extends Node {
  readonly type: 'razor-comment';
}

/** Control keywords recognized after `@`. Body grammar belongs to SDD-06. */
export type ControlKeyword = 'if' | 'else' | 'for' | 'foreach' | 'while' | 'switch';

/**
 * Layout directives (SDD-21, decision 84). Razor's own spelling: `@section` lowercase
 * because it is a block keyword like `@if`; the three `Render*` in PascalCase because in
 * Razor they are invocations. They are resolved HERE, in any file — WHERE each one is
 * valid (`Render*` only in a layout, `@section` only in a route) is a semantic rule
 * (SDD-21 §4.2), consistent with the syntactic/semantic split of the compiler.
 */
export type LayoutDirective = 'RenderBody' | 'RenderHead' | 'RenderSection' | 'section';

/**
 * What an `at-trigger` (`@` + identifier) resolves to.
 *  - 'control'    -> SDD-06 parses the construct body.
 *  - 'code-block' -> @code; SDD-08 parses it.
 *  - 'raw'        -> `@raw( ... )` directive (decision 18, option A).
 *  - 'directive'  -> a layout directive; SDD-21 parses its parentheses/body.
 *  - 'implicit'   -> an implicit expression, fully resolved here.
 *
 * `keywordSpan` covers the IDENTIFIER only, never the leading `@`: the caller
 * already holds the `@` offset, and `RazorExpression.span` is the node that owns
 * the whole atom.
 */
export type TriggerResolution =
  | { readonly kind: 'control'; readonly keyword: ControlKeyword; readonly keywordSpan: Span }
  | { readonly kind: 'code-block'; readonly keywordSpan: Span }
  | { readonly kind: 'raw'; readonly expression: RazorExpression; readonly keywordSpan: Span }
  | { readonly kind: 'directive'; readonly directive: LayoutDirective; readonly keywordSpan: Span }
  | { readonly kind: 'implicit'; readonly expression: RazorExpression };

/** The closed set of control keywords (decisions 9-17). */
const CONTROL_KEYWORDS: ReadonlySet<string> = new Set<ControlKeyword>([
  'if',
  'else',
  'for',
  'foreach',
  'while',
  'switch',
]);

/** The closed set of layout directives (decision 84). */
const LAYOUT_DIRECTIVES: ReadonlySet<string> = new Set<LayoutDirective>([
  'RenderBody',
  'RenderHead',
  'RenderSection',
  'section',
]);

const IDENT_START = /[\p{ID_Start}$_]/u;
const IDENT_PART = /[\p{ID_Continue}$]/u;

function isIdentStart(c: string | undefined): boolean {
  return c !== undefined && IDENT_START.test(c);
}

function isIdentPart(c: string | undefined): boolean {
  return c !== undefined && IDENT_PART.test(c);
}

/** End offset of the identifier starting at `from`, or `from` if there is none. */
function identifierEnd(source: string, from: number): number {
  if (!isIdentStart(source[from])) return from;
  let i = from + 1;
  while (isIdentPart(source[i])) i++;
  return i;
}

/**
 * Classify the identifier that follows `@`. Returns the control/code keyword, or
 * null when it is not a reserved Razor keyword (=> the trigger is an implicit
 * expression). Pure lookup over the closed keyword set.
 */
export function classifyKeyword(identifier: string): ControlKeyword | 'code' | null {
  if (identifier === 'code') return 'code';
  return CONTROL_KEYWORDS.has(identifier) ? (identifier as ControlKeyword) : null;
}

/**
 * Classify the identifier that follows `@` as a layout directive (decision 84), or null.
 * Separate from `classifyKeyword` because the two sets have different owners and different
 * body grammars: SDD-06 parses a control body, SDD-21 parses a directive's parentheses.
 */
export function classifyDirective(identifier: string): LayoutDirective | null {
  return LAYOUT_DIRECTIVES.has(identifier) ? (identifier as LayoutDirective) : null;
}

/**
 * The `.` or `?.` a chain link starts with, or 0 when the character at `i` is neither.
 * Its LENGTH, because that is what both callers need: how far to look for the name, and
 * how wide the dangling span is when no name follows.
 */
function accessorAt(source: string, i: number): 0 | 1 | 2 {
  if (source[i] === '.') return 1;
  return source[i] === '?' && source[i + 1] === '.' ? 2 : 0;
}

/**
 * Scan an implicit expression starting at `atOffset` (`@` included). An implicit
 * expression is a CHAIN, not a path (decision 100): after the leading identifier come
 * `.name`, `?.name`, a balanced `( … )` and a balanced `[ … ]`, repeated in any order.
 * It stops — silently — at anything else: `!` (decision 4), `<` (decision 5), an
 * operator, whitespace. `@( ... )` is for what is NOT a chain (decision 104).
 *
 * Adjacency is the whole of the boundary rule (decision 101): the chain never crosses
 * whitespace, so `@del (x)` is the chain `del` followed by the literal text ` (x)`. It
 * is the rule `@raw(` already followed.
 *
 * A `.` or `?.` with no name behind it does not join the chain — decision 2 stands and
 * the dot is still literal text in the output — but it IS recorded in `dangling`, which
 * is what lets the editor ask for the members of what precedes it (decision 102).
 *
 * The stops carry NO diagnostic on purpose (§4.5.2): the dominant case is literal
 * punctuation after an interpolation (`@name.`, `@name!`), and warning there would
 * be all false positives. The balancer's own — an unterminated group — do travel out.
 */
export function scanImplicitExpression(
  source: string,
  atOffset: number,
): ParseResult<RazorExpression> {
  const exprStart = atOffset + 1;
  let i = identifierEnd(source, exprStart);

  // Degenerate: the tokenizer guarantees an identifier start here, so this only
  // fires on a direct call with a bad offset. Degrade, never throw.
  if (i === exprStart) {
    return ok({
      type: 'razor-expression',
      kind: 'implicit',
      span: span(atOffset, exprStart),
      expr: emptySpan(exprStart),
      regions: [],
    });
  }

  const regions: LexRegion[] = [];
  const diagnostics: Diagnostic[] = [];
  let dangling: Span | undefined;

  for (;;) {
    const accessor = accessorAt(source, i);
    if (accessor !== 0) {
      const next = identifierEnd(source, i + accessor);
      if (next === i + accessor) {
        dangling = span(i, i + accessor);
        break;
      }
      i = next;
      continue;
    }

    const char = source[i];
    if (char !== '(' && char !== '[') break;
    // The balancer owns the boundary, so a `)` inside a string argument does not close
    // the group, and the regions it walked travel with the node.
    const group = char === '(' ? scanParens(source, i) : scanBrackets(source, i);
    regions.push(...group.value.regions);
    diagnostics.push(...group.diagnostics);
    i = group.value.span.end;
    // Unterminated: the group already ran to the end of source, so there is no chain left.
    if (!group.value.closed) break;
  }

  const expression: RazorExpression = {
    type: 'razor-expression',
    kind: 'implicit',
    span: span(atOffset, i),
    expr: span(exprStart, i),
    regions,
    ...(dangling !== undefined ? { dangling } : {}),
  };
  return diagnostics.length === 0 ? ok(expression) : withDiagnostics(expression, diagnostics);
}

/** Wrap an `explicit-expr` token (`@( ... )`) into the unified RazorExpression. */
export function expressionFromToken(token: JsRegionToken): RazorExpression {
  return {
    type: 'razor-expression',
    kind: 'explicit',
    span: token.span,
    expr: token.group.inner,
    regions: token.group.regions,
  };
}

/**
 * Resolve an `at-trigger`. `atOffset` points at the `@`; the char at atOffset+1 is
 * an identifier-start (guaranteed by the tokenizer, SDD-03). Reads the identifier,
 * dispatches control/code keywords, or scans the implicit expression. Never throws.
 * The caller advances the lexer with `lexer.seekTo(resolutionEnd(resolution))`.
 */
export function resolveTrigger(source: string, atOffset: number): ParseResult<TriggerResolution> {
  const identStart = atOffset + 1;
  const identEnd = identifierEnd(source, identStart);

  if (identEnd === identStart) {
    const degraded = scanImplicitExpression(source, atOffset);
    return ok({ kind: 'implicit', expression: degraded.value });
  }

  const identifier = source.slice(identStart, identEnd);
  const keywordSpan = span(identStart, identEnd);
  const keyword = classifyKeyword(identifier);

  if (keyword === 'code') return ok({ kind: 'code-block', keywordSpan });
  if (keyword !== null) return ok({ kind: 'control', keyword, keywordSpan });

  // Layout directives (SDD-21). Resolved before `@raw` and before the implicit
  // expression: they are reserved words, so `@RenderBody` never degrades to the literal
  // text `RenderBody` — a missing `(` is a diagnostic (FUD0432), not silence.
  const directive = classifyDirective(identifier);
  if (directive !== null) return ok({ kind: 'directive', directive, keywordSpan });

  // `@raw( ... )` is the one non-control directive (decision 18, option A). The
  // `(` must be adjacent: `@raw (x)` is the implicit expression `raw`, since an
  // implicit expression never crosses whitespace (§4.3).
  if (identifier === 'raw' && source[identEnd] === '(') {
    const group = scanParens(source, identEnd);
    const expression: RazorExpression = {
      type: 'razor-expression',
      kind: 'explicit',
      // The atom is the whole directive, so SDD-07 can replace `@raw(...)` wholesale.
      span: span(atOffset, group.value.span.end),
      expr: group.value.inner,
      regions: group.value.regions,
    };
    const resolution: TriggerResolution = { kind: 'raw', expression, keywordSpan };
    return group.diagnostics.length === 0
      ? ok(resolution)
      : withDiagnostics(resolution, group.diagnostics);
  }

  const expression = scanImplicitExpression(source, atOffset);
  const resolution: TriggerResolution = { kind: 'implicit', expression: expression.value };
  // An unterminated group in the chain has something to say; a bare path never does.
  return expression.diagnostics.length === 0
    ? ok(resolution)
    : withDiagnostics(resolution, expression.diagnostics);
}

/**
 * Offset just past a resolution: where the caller resumes the lexer. Convenience
 * so every call site does not re-derive it from the variant (`keywordSpan.end` for
 * control/code, the expression span end otherwise).
 */
export function resolutionEnd(resolution: TriggerResolution): number {
  switch (resolution.kind) {
    case 'control':
    case 'code-block':
    case 'directive':
      return resolution.keywordSpan.end;
    case 'raw':
    case 'implicit':
      return resolution.expression.span.end;
  }
}
