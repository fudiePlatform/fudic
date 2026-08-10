/**
 * The page maps the runtime consumes: `fud-tree` (composition) and `fud-bus` (directed
 * hydration). SDD-15 §3.4 and §3.5.
 *
 * Both are **tag → tags** and both are resolved at COMPILE time over the reachable graph,
 * which is what makes their weight irrelevant: a page with 200 cards has the same
 * `app-card` entry as a page with one. They grow with the catalogue of components — bounded,
 * dozens — and not with the number of instances.
 *
 * `fud-chunks` is NOT here, and its absence is deliberate (SDD-15 §3.6, retired): the URL of
 * a tag's hydration chunk is derivable from `fudic-routes.json` with
 * `createUrlResolver(base, build).hydrateUrl(tag)` (SDD-27 §4.1), and the runtime reads the
 * tag off `host.localName`. Emitting it too would put the same fact in two files that are
 * published by different paths and expire by different rules — the manifest is purged per
 * build, a JSON inside a prerendered HTML lives as long as that HTML is cached — so a deploy
 * would leave a page pointing at chunks of the previous build.
 */

import type { ComponentGraph, ResolvedComponent } from './resolve.js';
import type { CodeWriter } from './writer.js';
import { templateOf, walkElements } from './level.js';

/** `Record<parent tag, direct hydratable child tags>` — an empty record for a flat page. */
export type TagMap = Record<string, readonly string[]>;

/**
 * The composition map: for each hydratable tag, the hydratable component tags its own
 * template renders.
 *
 * **The children are the ones of the SHADOW, never the ones of the light DOM**, and it has
 * to be written down because a reader assumes it the other way round. The `<app-badge>` that
 * `home.fud` writes inside `<app-card>` is NOT a child of `app-card` here: it is a child of
 * whoever holds that markup, and in the DOM it is found by a `querySelectorAll` over that
 * owner's tree — the badge is slotted into the card, it does not live in its shadow. Walking
 * only the component's OWN template is what gets that right for free: a host nested in
 * another host's light DOM inside this template still belongs to THIS template's shadow, and
 * so it is a child of this tag.
 *
 * The reason underneath is SDD-17 §4.4: the cascade exists because the parent's controller
 * passes props to the children IT mounts, and it passes none to a light-DOM child.
 *
 * A tag with no hydratable children has no entry (§3.4).
 */
export function fudTree(graph: ComponentGraph, hydratable: ReadonlySet<string>): TagMap {
  const out: Record<string, string[]> = {};
  for (const comp of graph.components.values()) {
    if (!hydratable.has(comp.tag)) continue;
    const children = childTags(graph, comp, hydratable);
    if (children.length > 0) out[comp.tag] = children;
  }
  return out;
}

/** The hydratable component tags this component's template renders, in first-use order. */
function childTags(
  graph: ComponentGraph,
  comp: ResolvedComponent,
  hydratable: ReadonlySet<string>,
): string[] {
  const seen = new Set<string>();
  walkElements(templateOf(comp), (el) => {
    if (graph.components.has(el.name) && hydratable.has(el.name)) seen.add(el.name);
  });
  return [...seen];
}

/**
 * The compile-time map constants of a page module — the ones a page and a route both need,
 * written by the one function so the two shapes cannot drift.
 *
 * An EMPTY map gets no constant: a `{}` is a fetch and a parse for nothing, and the runtime
 * has to handle the absence anyway — a zero-JS page is the base case of the framework, not
 * an exception.
 */
export function writeMapConstants(
  w: CodeWriter,
  graph: ComponentGraph,
  hydratable: ReadonlySet<string>,
): void {
  const tree = fudTree(graph, hydratable);
  if (Object.keys(tree).length > 0) w.line(`const FUD_TREE = ${JSON.stringify(tree)};`);
}
