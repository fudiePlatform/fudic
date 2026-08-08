/**
 * The control-flow AST (SDD-06 §3.1). Every node here is a `RazorConstruct` as far
 * as SDD-05 is concerned: it hosts them as children without inspecting them.
 *
 * Headers are OPAQUE JS: SDD-06 only delimits them with the balancer (SDD-02); their
 * validity — `for...of` vs `for...in`, C-style vs for-of, the shape of a `case` test —
 * is Oxc's (SDD-11) and semantics' (SDD-12).
 */

import type { Node, Span } from '../types/index.js';
import type { BalancedGroup } from '../balancer/index.js';
import type { RazorExpression } from '../at/index.js';
import type { HtmlContent } from '../html/index.js';

/** Every control construct SDD-06 produces. Assignable to SDD-05's RazorConstruct. */
export type ControlNode = IfNode | ForeachNode | ForNode | WhileNode | SwitchNode;

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
   * The key expression. `span` covers the whole `key (…)` clause, `expr` only its JS.
   * Absent when the clause was not written, or was written malformed (`FUD0541`).
   */
  readonly key?: RazorExpression;
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

/** `@foreach (const x of xs) key (…) { … }` — for-of iteration (decisions 11, 91). */
export interface ForeachNode extends Node, KeyedNode {
  readonly type: 'foreach';
  readonly header: ControlHeader;
  readonly body: readonly HtmlContent[];
}

/** `@for (let i = 0; i < n; i++) key (…) { … }` — indexed iteration (decisions 11, 91). */
export interface ForNode extends Node, KeyedNode {
  readonly type: 'for';
  readonly header: ControlHeader;
  readonly body: readonly HtmlContent[];
}

/** `@while (cond) key (…) { … }` — decision 91. */
export interface WhileNode extends Node, KeyedNode {
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

/** A `case <expr>:` (arbitrary expression, decision 15) or `default:`. Independent body. */
export interface SwitchCase extends Node {
  readonly type: 'switch-case';
  /** The `case` test: opaque JS up to the label `:`. Absent ⇒ this is the `default` case. */
  readonly test?: Span;
  readonly body: readonly HtmlContent[];
}
