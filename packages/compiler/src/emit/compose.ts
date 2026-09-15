/**
 * The COMPOSED page, as the client half of a route has to walk it (SDD-39 §4.3).
 *
 * A route adopts from the `<body>`, and what hangs off the `<body>` is the layout's markup
 * with the route's spliced into it: its own nodes at the `@RenderBody()`, each of its
 * `@section`s at the matching `@RenderSection(name)`, and the whole chain when layouts are
 * nested. So the walk starts one level above anything the route wrote, and has to step over
 * what the layout put in front.
 *
 * **What comes out is a skeleton, not a tree.** Every layout element is one of two things —
 * something to step over, or something to descend into — and NEITHER carries a byte of the
 * layout's source into the emit. That is what keeps SDD-13 §4.3 intact: a module's map has
 * one `sources` entry, so the moment a slice of the layout reached the output the route's
 * chunk would need a second one. Crossing the layout is calls to the cursor and nothing
 * else; every anchor the chunk publishes is the route's own (§6.6).
 *
 * The composition of the SERVER side is untouched and stays what SDD-21 made it: a module
 * importing a module, four slots, no text merged anywhere. This is the client's reading of
 * the same shape, and it is read-only over `graph.layouts`.
 */

import type { HtmlContent } from '../html/index.js';
import type { LayoutDocument, RouteDocument } from '../document/index.js';
import type { ControlNode } from '../control/index.js';
import type { RenderSectionNode, SectionNode } from '../layout/index.js';
import { branchesOf } from './constructs.js';
import type { DocumentGraph } from './resolve.js';

/** Which of the route's own runs of markup goes at a point of the walk. */
export type Hole =
  | { readonly kind: 'body' }
  | { readonly kind: 'section'; readonly name: string };

/**
 * One step of a level of the walk.
 *
 * `skip` and `enter` are both ONE element of the layout: the difference is only whether the
 * route has anything underneath it. `hole` is the route's own markup, walked by the same
 * emitter that walks a component's template — it shares the level's cursor, because the
 * route's elements are siblings of the layout's and the cursor has to come out of the hole
 * standing where the route left it.
 */
export type ComposeItem =
  | { readonly kind: 'skip' }
  | { readonly kind: 'enter'; readonly items: readonly ComposeItem[] }
  | { readonly kind: 'hole'; readonly hole: Hole };

/** Whether a level — or anything under it — reaches a hole. An `enter` is one that does. */
function reachesHole(items: readonly ComposeItem[]): boolean {
  return items.some((i) => i.kind === 'hole' || (i.kind === 'enter' && reachesHole(i.items)));
}

/**
 * Drop what comes after the last hole: the walk stops the moment the route has nothing left
 * to adopt, so a `<footer>` the layout writes below the body costs not a line of chunk.
 */
function trimAfterLastHole(items: readonly ComposeItem[]): readonly ComposeItem[] {
  let last = -1;
  items.forEach((item, i) => {
    if (item.kind === 'hole' || (item.kind === 'enter' && reachesHole(item.items))) last = i;
  });
  return items.slice(0, last + 1);
}

/**
 * The layout chain, OUTERMOST first — the order the DOM has it in.
 *
 * `graph.layouts` is innermost first, because that is the order a module import chain is
 * written in; the `<body>` belongs to the other end of the same list.
 */
function outermostFirst(graph: DocumentGraph): readonly LayoutDocument[] {
  return [...graph.layouts].reverse().map((l) => l.doc);
}

/**
 * The plan for one level of markup, given what the `@RenderBody()` in it resolves to.
 *
 * `inner` is the rest of the chain: the next layout's body children, and at the end of it
 * the route's own markup. It is a thunk because a level that holds no `@RenderBody()` must
 * not pay for planning the rest of the chain.
 */
function levelOf(
  children: readonly HtmlContent[],
  inner: () => readonly ComposeItem[],
): readonly ComposeItem[] {
  const items: ComposeItem[] = [];
  for (const child of children) {
    switch (child.type) {
      case 'element': {
        const under = trimAfterLastHole(levelOf(child.children, inner));
        items.push(reachesHole(under) ? { kind: 'enter', items: under } : { kind: 'skip' });
        break;
      }
      case 'render-body':
        items.push(...inner());
        break;
      case 'render-section': {
        const name = (child as unknown as RenderSectionNode).name;
        // An unnamed one is FUD0433 degradation: it renders nothing on the server either,
        // so there is nothing here to walk.
        if (name !== '') items.push({ kind: 'hole', hole: { kind: 'section', name } });
        break;
      }
      case 'if':
      case 'switch':
      case 'foreach':
      case 'for':
      case 'while':
        // A construct in a LAYOUT. Its branches are walked so a hole inside one is still
        // found, and its own elements contribute no step: a layout's markup is static in
        // this version (§7), so a skeleton is what there is to walk. The day a layout may
        // render conditionally around the route's body, this is the line that has to change.
        for (const branch of branchesOf(child as unknown as ControlNode)) {
          items.push(...levelOf(branch.body, inner));
        }
        break;
      default:
        // Text, comments, interpolations, `@code`, `@RenderHead()`: the walk is an ELEMENT
        // cursor, and none of them is one.
        break;
    }
  }
  return items;
}

/**
 * The walk from the `<body>` to every run of markup the route owns.
 *
 * For a PAGE — a route that owns its own shell — there is no layout and no stepping over:
 * its markup hangs straight off the `<body>`, which is the one-item plan.
 */
export function composePage(graph: DocumentGraph): readonly ComposeItem[] {
  const chain = outermostFirst(graph);
  const body: readonly ComposeItem[] = [{ kind: 'hole', hole: { kind: 'body' } }];
  const from = (i: number): readonly ComposeItem[] => {
    const layout = chain[i];
    return layout === undefined ? body : levelOf(layout.body.children, () => from(i + 1));
  };
  return trimAfterLastHole(from(0));
}

/** The route's own markup for one hole — its body, or the `@section` of that name. */
export function holeContent(route: RouteDocument, hole: Hole): readonly HtmlContent[] {
  if (hole.kind === 'body') return route.markup;
  const section = (route.sections as readonly SectionNode[]).find((s) => s.name === hole.name);
  return section?.children ?? [];
}
