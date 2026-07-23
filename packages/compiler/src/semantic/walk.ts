/**
 * Shared tree traversal for the analyzers (SDD-12 §4). Each analyzer is an independent
 * rule (SOLID), but they all walk the same element tree; centralizing the walk keeps the
 * recursion — and the control-body descent — in one place.
 *
 * The control-flow children are stored in the SDD-05 tree as the base `RazorConstruct`
 * (`{ type, span }`); SDD-06 guarantees a node whose `type` is `'if'`/`'foreach'`/… is the
 * matching concrete node, so the walk narrows by discriminant and casts to the SDD-06 shape.
 */

import type { HtmlContent, ElementNode, RawExpressionNode } from '../html/index.js';
import type { IfNode, ForeachNode, ForNode, WhileNode, SwitchNode } from '../control/index.js';
import type { RazorExpression } from '../at/index.js';
import type { StructuredDocument } from '../document/index.js';
import type { CodeBlockNode } from '../code/index.js';

/** Callbacks a walk fires. All optional: an analyzer supplies only what its rule needs. */
export interface TreeVisitor {
  /** Every `ElementNode`, in source order, parents before children. */
  element?(el: ElementNode): void;
  /** Entering a loop body (`@foreach`/`@for`/`@while`) — decision 31's loop context. */
  enterLoop?(): void;
  /** Leaving a loop body. Balanced with `enterLoop`. */
  exitLoop?(): void;
  /** A content-level interpolation: a bare `@expr` or the inner expr of `@raw(…)`. */
  interpolation?(expr: RazorExpression): void;
}

/**
 * The element-bearing roots of a structured document. A page is fully reachable from its
 * `<html>`; a component's renderable tree hangs off the host wrapper, with the `<link>`s and
 * the head fragment as siblings. The `@code` is JS, not element content — the region
 * analyzers read it from `documentCode`, so it is not walked here.
 */
export function documentRoots(document: StructuredDocument): readonly HtmlContent[] {
  if (document.type === 'page-document') return [document.html];
  const roots: HtmlContent[] = [...document.links];
  if (document.head) roots.push(document.head);
  if (document.host) roots.push(document.host);
  return roots;
}

/** The `@code` block of either document shape, if present. */
export function documentCode(document: StructuredDocument): CodeBlockNode | undefined {
  return document.code;
}

/** Walk the content list depth-first, firing the visitor's callbacks. */
export function walk(content: readonly HtmlContent[], visitor: TreeVisitor): void {
  for (const node of content) walkNode(node, visitor);
}

function walkNode(node: HtmlContent, visitor: TreeVisitor): void {
  switch (node.type) {
    case 'element':
      visitor.element?.(node);
      walk(node.children, visitor);
      return;
    case 'razor-expression':
      visitor.interpolation?.(node);
      return;
    case 'raw-expression':
      visitor.interpolation?.((node as RawExpressionNode).expr);
      return;
    case 'if': {
      const ifNode = node as unknown as IfNode;
      for (const branch of ifNode.branches) walk(branch.body, visitor);
      if (ifNode.elseBody) walk(ifNode.elseBody, visitor);
      return;
    }
    case 'foreach':
    case 'for':
    case 'while': {
      const loop = node as unknown as ForeachNode | ForNode | WhileNode;
      visitor.enterLoop?.();
      walk(loop.body, visitor);
      visitor.exitLoop?.();
      return;
    }
    case 'switch': {
      const switchNode = node as unknown as SwitchNode;
      for (const branch of switchNode.cases) walk(branch.body, visitor);
      return;
    }
    default:
      // Leaves and JS-only nodes (text, comment, style, inline-code, @code, …): nothing to descend.
      return;
  }
}
