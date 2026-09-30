/**
 * The layout-directive AST (SDD-21 §3.2). Four nodes, all `RazorConstruct`s as far as
 * SDD-05 is concerned: it hosts them as children without inspecting them.
 *
 * They are pure MARKERS: `@RenderBody()` says "the route's body goes here", nothing more.
 * Their cardinality and the role of document they may appear in (decisions 84, 86) are
 * validated by SDD-10's structuring pass, which is the one that knows the role; the emit
 * turns each marker into a call into the route's slots (SDD-21 §4.5).
 */

import type { Node, Span } from '../types/index.js';
import type { HtmlContent } from '../html/index.js';

/** Every node SDD-21 produces. Assignable to SDD-05's `RazorConstruct`. */
export type LayoutNode = RenderDirectiveNode | RenderSectionNode | SectionNode;

/**
 * `slot: "name"` — the named slot of the component that wraps a hole (SDD-48).
 *
 * Every root element the route writes into that hole comes out with `slot="name"`, so the
 * route writes siblings and never the wrapper `<div slot>` it would otherwise need.
 */
export interface SlotArgument {
  /** The slot name, without its quotes. */
  readonly name: string;
  /** The string literal, quotes included. */
  readonly span: Span;
}

/**
 * `@RenderBody()` / `@RenderHead()` — parentheses mandatory (decision 85). A missing `(` is
 * FUD0432 and the node is still produced (recovery): the layout keeps its insertion point,
 * the author gets the diagnostic. `@RenderBody(slot: "x")` is the one argument either takes.
 */
export interface RenderDirectiveNode extends Node {
  readonly type: 'render-body' | 'render-head';
  /** Covers the identifier only, never the leading `@` (SDD-04 convention). */
  readonly keywordSpan: Span;
  /** `@RenderBody(slot: "x")` (SDD-48). Never on a `@RenderHead()`. */
  readonly slot?: SlotArgument;
}

/**
 * `@RenderSection(name)` — a bare identifier, never a string (decision 85), so the name
 * is resolvable by construction, with no constant folding. SDD-48 adds two named
 * arguments after it: `required: true` and `slot: "x"`.
 */
export interface RenderSectionNode extends Node {
  readonly type: 'render-section';
  /** Empty string when the argument was missing or not an identifier (FUD0433). */
  readonly name: string;
  readonly nameSpan: Span;
  readonly keywordSpan: Span;
  /** `required: true`: every route of this layout must declare the section (SDD-48). */
  readonly required: boolean;
  readonly slot?: SlotArgument;
}

/** `@section name { … }` — declared in a route, rendered by its layout (decision 84). */
export interface SectionNode extends Node {
  readonly type: 'section';
  /** Empty string when the name was missing (FUD0433). */
  readonly name: string;
  readonly nameSpan: Span;
  readonly keywordSpan: Span;
  readonly children: readonly HtmlContent[];
}
