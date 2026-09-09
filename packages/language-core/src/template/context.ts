/**
 * What every template projector needs, and the recursion hook that keeps them apart.
 *
 * The bodies of `@if`, `@foreach` and `@section` hold markup, so those projectors must
 * re-enter the dispatcher — which lives above them. Injecting the recursion as `emit()`
 * instead of importing it keeps the dependency one-way and the modules independently
 * testable; the alternative is a cycle between the dispatcher and every construct.
 */

import type { DelegationPlan, HtmlContent, OxcNode, Span } from '@fudic/compiler';
import type { Aliases } from '../imports.js';
import type { VirtualWriter } from '../writer.js';

/** The AST of one registered JS fragment: an expression, or a list of statements. */
export type FragmentAst = OxcNode | readonly OxcNode[];

export interface TemplateContext {
  /** The `.fud` text every verbatim copy is sliced from. */
  readonly source: string;
  readonly w: VirtualWriter;
  /** Contracts in scope: component tags and the layout's section union. */
  readonly aliases: Aliases;
  /**
   * The COMPONENT that hosts what is being projected, or `undefined` when the nearest
   * enclosing element is not one. It is what a `slot=` is checked against: a slot is declared
   * by the component a child goes into, never by the child itself (BUG-23 §2.6).
   */
  readonly host: string | undefined;
  /**
   * The names this `.fud` declares with `signal(...)` / `computed(...)`, from `reactiveNames`.
   *
   * The projection needs them because the emit crosses the READ of a reactive and not the
   * object (decision 84), and an editor that checks a different expression than the build
   * emits is BUG-23 §2.8. Empty when nobody handed the emitter a parsed `@client`.
   */
  readonly reactives: ReadonlySet<string>;
  /**
   * The AST registered at a source span, for the one question text cannot answer: is the
   * root of this value a call? `@(x ? a : b)()` and `@(f)` do not separate by regex.
   *
   * Absent when the caller's batch does not register attribute values, in which case a
   * handler is copied as written — which is what the projection did before BUG-23.
   */
  readonly ast: ((at: Span) => FragmentAst | undefined) | undefined;
  /**
   * Who hands what to whom (SDD-37), for the one question the element tree cannot answer
   * locally: `$day` is written in an ancestor's handler and declared by a loop BELOW it, so
   * the projection has to be told which loop before it can give the name a type (§4.5).
   */
  readonly delegation: DelegationPlan;
  /** Project a list of children. The dispatcher supplies it. */
  emit(content: readonly HtmlContent[]): void;
}
