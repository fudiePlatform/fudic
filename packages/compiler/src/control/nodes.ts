/**
 * The control-flow AST (SDD-06 §3.1). Every node here is a `RazorConstruct` as far
 * as SDD-05 is concerned: it hosts them as children without inspecting them.
 *
 * Headers are OPAQUE JS: SDD-06 only delimits them with the balancer (SDD-02); their
 * validity — `for...of` vs `for...in`, C-style vs for-of, the shape of a `case` test —
 * is Oxc's (SDD-11) and semantics' (SDD-12).
 */

import type { Node, Span } from '../types/index.js';
import { isEmptySpan } from '../types/index.js';
import type { BalancedGroup } from '../balancer/index.js';
import type { RazorExpression } from '../at/index.js';
import type { HtmlContent } from '../html/index.js';

/** Every control construct SDD-06 produces. Assignable to SDD-05's RazorConstruct. */
export type ControlNode = IfNode | ForeachNode | ForNode | WhileNode | SwitchNode;

/**
 * What `parseControl` produces: the five control constructs, and `@await`. `@await` stays out
 * of `ControlNode` on purpose: it has no header in parentheses and no key, and every reader of
 * a header or a key would otherwise have to rule it out. Who needs it asks for it by name.
 */
export type ControlConstruct = ControlNode | AwaitNode;

/**
 * The `key (…)` clause that follows a control header (decisions 91–93, SDD-30 §3.5).
 *
 * It is written OUTSIDE the parenthesis so the header still reaches Oxc verbatim, and it
 * carries an ordinary `expression` fragment: one more `RazorExpression`, registered in the
 * same `JsBatch` as everything else — Oxc is still invoked once per file.
 *
 * All five constructs declare it, including the two that do not iterate: `@if` and
 * `@switch` need somewhere to PUT a key in order to report `FUD0542` on it, and a field
 * they cannot express is a field the parser would have to throw away.
 */
export interface KeyedNode {
  /**
   * The key clause. `span` covers the whole `key (…)`, `expr` only its JS.
   *
   * Absent when the clause was not written at all (or written with no `(` — nothing opened).
   * An opened clause is ALWAYS here, and carries an EMPTY `expr` when it holds nothing
   * readable, so that `key (|)` is a position the editor can ask from (BUG-17 §3.5). Read it
   * through `keyExpression()` rather than directly whenever the answer feeds code.
   */
  readonly key?: RazorExpression;
}

/**
 * The JS of a key clause, or `undefined` when there is none to read.
 *
 * The field cannot answer this on its own, and deliberately so: the editor wants the empty
 * clause — it is where the caret is — while everything that GENERATES code wants it gone,
 * because an empty span slices to the empty string and `key: ,` is not JavaScript. One
 * predicate owns the distinction so no emitter has to remember it.
 */
export function keyExpression(node: KeyedNode): Span | undefined {
  const expr = node.key?.expr;
  return expr === undefined || isEmptySpan(expr) ? undefined : expr;
}

/**
 * A parenthesized control header `( … )`: opaque JS delimited by the balancer, validated by
 * Oxc (SDD-11). `.inner` is the JS span handed to Oxc; `.regions` are its lexical regions.
 * Used as the condition of `@if`/`@while`, the discriminant of `@switch`, and the for/for-of
 * header of `@for`/`@foreach` (whose for-of vs C-style shape is checked semantically, §4.4).
 *
 * A construct whose `(` was missing (FUD0070) still carries a header, degraded: an empty
 * span at the offset where the `(` was expected, with `closed: false`. The field is
 * required by the type, so a degraded node fills it rather than inventing an optional.
 */
export type ControlHeader = BalancedGroup;

/** `@if (…) { … } (else if (…) { … })* (else { … })?` — decisions 9, 10. */
export interface IfNode extends Node, KeyedNode {
  readonly type: 'if';
  /**
   * [0] is the `if`; [1..] are `else if` branches, in source order. Non-empty for every
   * well-formed `@if`; EMPTY only in the two degraded shapes that have no arm to point at:
   * an `@if` with no `(` (FUD0070) and an orphan `@else` (FUD0073).
   */
  readonly branches: readonly ConditionalBranch[];
  /** Trailing `else` body, when present. Absent ⇒ no final else. */
  readonly elseBody?: readonly HtmlContent[];
}

/**
 * One `if` / `else if` arm: condition + block body. It is a `Node` like
 * `SwitchCase`: both are addressable pieces of a compound node, and the query by
 * offset and the visitors need a `type` to dispatch on. Asymmetry here would mean
 * one of the two is invisible to a visitor.
 */
export interface ConditionalBranch extends Node {
  readonly type: 'conditional-branch';
  readonly header: ControlHeader;
  readonly body: readonly HtmlContent[];
  /**
   * Whole arm span. The first arm starts at the construct's `@`, so it leaves no hole
   * between `IfNode.span.start` and `branches[0].span.start`; an `else if` arm starts at
   * its `else` (its `@`, when written `@else`) and runs through its closing `}`.
   */
  readonly span: Span;
}

/**
 * `@empty { … }` right after the body of a loop (decision 163): what the loop renders when it
 * makes no pass. A child of the loop and not a sibling, so the loop's span covers it and a
 * walk reaches it from the loop. Its body sees the scope AROUND the loop, never the header.
 */
export interface EmptyBlock extends Node {
  readonly type: 'empty-block';
  readonly body: readonly HtmlContent[];
}

/** What the three loops share: their `@empty`, when one was written. */
export interface LoopNode {
  readonly empty?: EmptyBlock;
}

/** `@foreach (const x of xs) key (…) { … }` — for-of iteration (decisions 11, 91). */
export interface ForeachNode extends Node, KeyedNode, LoopNode {
  readonly type: 'foreach';
  readonly header: ControlHeader;
  readonly body: readonly HtmlContent[];
}

/** `@for (let i = 0; i < n; i++) key (…) { … }` — indexed iteration (decisions 11, 91). */
export interface ForNode extends Node, KeyedNode, LoopNode {
  readonly type: 'for';
  readonly header: ControlHeader;
  readonly body: readonly HtmlContent[];
}

/** `@while (cond) key (…) { … }` — decision 91. */
export interface WhileNode extends Node, KeyedNode, LoopNode {
  readonly type: 'while';
  readonly header: ControlHeader;
  readonly body: readonly HtmlContent[];
}

/** `@switch (expr) { case …: … default: … }` — no fall-through (decision 14). */
export interface SwitchNode extends Node, KeyedNode {
  readonly type: 'switch';
  readonly header: ControlHeader;
  readonly cases: readonly SwitchCase[];
}

/**
 * `@await data.users { … } @catch (e) { … }` — decisions 168, 169 (SDD-70). The body paints
 * when the `later` field resolves, with `data.users` already its value; the `@catch` when it
 * fails, with `e` a `Problem`.
 *
 * It takes no parentheses and no key: what follows the keyword is the read of a field, as
 * written, up to the `{`. Whether it IS a `later` field of `data` is semantics' (`FUD1320`).
 */
export interface AwaitNode extends Node {
  readonly type: 'await';
  /** What is awaited, trimmed: `data.users`. Empty at the `{` when nothing was written. */
  readonly expression: Span;
  readonly body: readonly HtmlContent[];
  readonly catch?: CatchBlock;
}

/**
 * `@catch (e) { … }` right after the body of an `@await`. A child of the `@await` and not a
 * sibling, like `@empty` of a loop, so the `@await`'s span covers it.
 */
export interface CatchBlock extends Node {
  readonly type: 'catch-block';
  /** `( e )`: its `inner` is the name the `Problem` takes. Degraded when the `(` is missing. */
  readonly header: ControlHeader;
  readonly body: readonly HtmlContent[];
}

/** A `case <expr>:` (arbitrary expression, decision 15) or `default:`. Independent body. */
export interface SwitchCase extends Node {
  readonly type: 'switch-case';
  /** The `case` test: opaque JS up to the label `:`. Absent ⇒ this is the `default` case. */
  readonly test?: Span;
  readonly body: readonly HtmlContent[];
}
