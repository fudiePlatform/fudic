/**
 * Shared tree traversal for the analyzers (SDD-12 §4). Each analyzer is an independent
 * rule (SOLID), but they all walk the same element tree; centralizing the walk keeps the
 * recursion — and the control-body descent — in one place.
 *
 * The control-flow children are stored in the SDD-05 tree as the base `RazorConstruct`
 * (`{ type, span }`); SDD-06 guarantees a node whose `type` is `'if'`/`'foreach'`/… is the
 * matching concrete node, so the walk narrows by discriminant and casts to the SDD-06 shape.
 */

import type { HtmlContent, ElementNode, Attribute, RawExpressionNode } from '../html/index.js';
import type {
  ControlNode,
  IfNode,
  ForeachNode,
  ForNode,
  WhileNode,
  SwitchNode,
} from '../control/index.js';
import type { SectionNode } from '../layout/index.js';
import type { RazorExpression } from '../at/index.js';
import type { StructuredDocument } from '../document/index.js';
import type { CodeBlockNode } from '../code/index.js';

/** Callbacks a walk fires. All optional: an analyzer supplies only what its rule needs. */
export interface TreeVisitor {
  /**
   * Every `ElementNode`, in source order, parents before children.
   *
   * `host` is the nearest ANCESTOR element, control bodies seen through: `<app-circle>@if(x)
   * { <div slot="p"> } </app-circle>` still hosts the `div` in `app-circle`. A rule about a
   * `slot=` is a rule about the parent (BUG-23 §2.6), and asking the element that carries the
   * attribute was exactly what made the check land on the wrong tag.
   */
  element?(el: ElementNode, host?: ElementNode): void;
  /** Entering a loop body (`@foreach`/`@for`/`@while`) — decision 31's loop context. */
  enterLoop?(): void;
  /** Leaving a loop body. Balanced with `enterLoop`. */
  exitLoop?(): void;
  /** A content-level interpolation: a bare `@expr` or the inner expr of `@raw(…)`. */
  interpolation?(expr: RazorExpression): void;
  /**
   * Every Razor expression in an ATTRIBUTE — a value part, or the expression that names a
   * `bus:( … )` event (decision 28.b) — with the attribute that carries it.
   *
   * The walk went through these and never handed one over, so nobody could register an
   * attribute value's JS in the batch without traversing the tree a second time. That is
   * what left the projection with no AST to ask the shape of a handler from (BUG-23 §2.4).
   */
  binding?(expr: RazorExpression, attr: Attribute, el: ElementNode): void;
  /**
   * Every control construct, before its bodies are descended.
   *
   * The walk has always gone THROUGH these nodes and never handed one over, which is fine for
   * an analyzer that only cares about elements — and wrong for anyone asking what a given
   * offset *is*. The text between the parentheses of an `@if` is JavaScript, not markup, and
   * only the node knows where those parentheses are (BUG-17 §4.3).
   */
  control?(node: ControlNode): void;
}

/**
 * The element-bearing roots of a structured document. A page is fully reachable from its
 * `<html>`; a component's renderable tree hangs off the host wrapper, with the `<link>`s and
 * the head fragment as siblings. The `@code` is JS, not element content — the region
 * analyzers read it from `documentCode`, so it is not walked here.
 */
export function documentRoots(document: StructuredDocument): readonly HtmlContent[] {
  // A shell (page or layout) is fully reachable from its `<html>`.
  if (document.type === 'page-document' || document.type === 'layout-document') {
    return [document.html];
  }
  // A `@snippet` body is markup of THIS file until the expansion moves it: the tags it uses
  // are resolved against this file's links and its `@` constructs are analyzed here, which is
  // also the only pass an editor gets — it never expands (SDD-29 §4.11). Last in the list, so
  // the order every analyzer downstream already assumes does not move.
  const roots: HtmlContent[] = [...document.links, ...document.snippetLinks];
  if (document.type === 'snippet-document') return [...roots, ...document.snippets];
  if (document.head) roots.push(document.head);
  if (document.type === 'route-document') {
    // A route has no host wrapper: its markup IS the fragment, and its sections are
    // markup too — they render at the layout's `@RenderSection` points (SDD-21 §4.5).
    return [...roots, ...document.markup, ...document.sections, ...document.snippets];
  }
  if (document.host) roots.push(document.host);
  return [...roots, ...document.snippets];
}

/** The `@code` block of either document shape, if present. */
export function documentCode(document: StructuredDocument): CodeBlockNode | undefined {
  return document.code;
}

/**
 * Walk the content list depth-first, firing the visitor's callbacks.
 *
 * `host` is the element the list hangs under, and callers outside the walk never pass it: the
 * roots of a document have no parent element by definition.
 */
export function walk(
  content: readonly HtmlContent[],
  visitor: TreeVisitor,
  host?: ElementNode,
): void {
  for (const node of content) walkNode(node, visitor, host);
}

/**
 * The Razor expressions of one element's attributes, in source order. The name comes first
 * because that is where it is written: `bus:(EVENTS.cart)="@h"` names the event before it
 * gives the handler.
 */
function walkBindings(el: ElementNode, visitor: TreeVisitor): void {
  if (visitor.binding === undefined) return;
  for (const attr of el.attributes) {
    if (typeof attr.name !== 'string') visitor.binding(attr.name, attr, el);
    for (const part of attr.value) {
      if (part.type === 'razor-expression') visitor.binding(part, attr, el);
    }
  }
}

function walkNode(node: HtmlContent, visitor: TreeVisitor, host: ElementNode | undefined): void {
  switch (node.type) {
    case 'element':
      visitor.element?.(node, host);
      walkBindings(node, visitor);
      walk(node.children, visitor, node);
      return;
    case 'razor-expression':
      visitor.interpolation?.(node);
      return;
    case 'raw-expression':
      visitor.interpolation?.((node as RawExpressionNode).expr);
      return;
    case 'if': {
      const ifNode = node as unknown as IfNode;
      visitor.control?.(ifNode);
      for (const branch of ifNode.branches) walk(branch.body, visitor, host);
      if (ifNode.elseBody) walk(ifNode.elseBody, visitor, host);
      return;
    }
    case 'foreach':
    case 'for':
    case 'while': {
      const loop = node as unknown as ForeachNode | ForNode | WhileNode;
      visitor.control?.(loop);
      visitor.enterLoop?.();
      walk(loop.body, visitor, host);
      visitor.exitLoop?.();
      return;
    }
    case 'switch': {
      const switchNode = node as unknown as SwitchNode;
      visitor.control?.(switchNode);
      for (const branch of switchNode.cases) walk(branch.body, visitor, host);
      return;
    }
    case 'section':
      // `@section name { … }` (SDD-21): its body is ordinary markup, so the analyzers
      // must see inside it — a duplicate attribute there is just as wrong.
      walk((node as unknown as SectionNode).children, visitor, host);
      return;
    default:
      // Leaves and JS-only nodes (text, comment, style, inline-code, @code, …): nothing to descend.
      return;
  }
}
