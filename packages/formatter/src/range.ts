/**
 * Which node a selection means (§4.7).
 *
 * The smallest COMPLETE node that contains the range. Half an `@if` header is not something
 * that can be formatted — there is no document whose layout it is — so the answer is the
 * `@if`, and a user who selected three characters gets a construct back rather than a
 * mangled one.
 */

import type {
  ForeachNode,
  HtmlContent,
  IfNode,
  SectionNode,
  Span,
  SwitchNode,
} from '@fudic/compiler';

// A construct is stored as the base `RazorConstruct`; recover the concrete node.
const asIf = (node: HtmlContent): IfNode => node as unknown as IfNode;
const asLoop = (node: HtmlContent): ForeachNode => node as unknown as ForeachNode;
const asSwitch = (node: HtmlContent): SwitchNode => node as unknown as SwitchNode;
const asSection = (node: HtmlContent): SectionNode => node as unknown as SectionNode;

/**
 * The children of a node that are themselves HTML content.
 *
 * A `@code` has none: its parts are JS regions, not content, so a selection inside one
 * resolves to the `@code` itself. That is the right answer — its body is a single delegated
 * fragment, and half of it is not a fragment.
 */
export function childrenOf(node: HtmlContent): readonly HtmlContent[] {
  switch (node.type) {
    case 'element':
      return node.children;
    case 'if': {
      const branch = asIf(node);
      return [...branch.branches.flatMap((b) => b.body), ...(branch.elseBody ?? [])];
    }
    case 'foreach':
    case 'for':
    case 'while':
      return asLoop(node).body;
    case 'switch':
      return asSwitch(node).cases.flatMap((c) => c.body);
    case 'section':
      return asSection(node).children;
    default:
      return [];
  }
}

/** The deepest node whose span covers the whole range, or `undefined` if none does. */
export function smallestNodeAround(
  roots: readonly HtmlContent[],
  range: Span,
): HtmlContent | undefined {
  let best: HtmlContent | undefined;

  const visit = (nodes: readonly HtmlContent[]): void => {
    for (const node of nodes) {
      if (node.span.start <= range.start && range.end <= node.span.end) {
        best = node;
        // Siblings do not overlap, so no other node at this level can contain it either.
        visit(childrenOf(node));
        return;
      }
    }
  };

  visit(roots);
  return best;
}
