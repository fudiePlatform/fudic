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

import { allComponents, componentOf, type ComponentGraph, type ResolvedComponent } from './resolve.js';
import type { CodeWriter } from './writer.js';
import { classifyAttribute } from '../binding/index.js';
import { codeOf } from './oxc-code.js';
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
  for (const comp of allComponents(graph)) {
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
    if (componentOf(graph, el.name) !== undefined && hydratable.has(el.name)) seen.add(el.name);
  });
  return [...seen];
}

/**
 * The directed-hydration map: for each EMITTER tag, the tags that must be alive before it
 * (SDD-15 §3.5).
 *
 * Two relations from two sources. **Listening** (`bus:name` → tag) comes off the template,
 * already classified, with no Oxc involved. **Emission** (tag → name) comes off the
 * `emit(...)` calls of `@code { @client }`, and only when the name resolves to a string
 * literal — an unresolvable one is not an error, produces no diagnostic and still emits its
 * listener (§6.22).
 *
 * **The event name does not appear in the output.** It was resolved at compile time into a
 * tag→tags relation, so the runtime never reasons about names: it consumes «to bring A up,
 * bring B up first».
 *
 * **A tag does not list itself.** `app-actions` is exactly that case — it emits `cleared`
 * and carries `bus:cleared` in its own template — and an entry
 * `{"app-actions":["app-actions"]}` would tell the runtime that raising A requires raising A
 * first. The edge is dropped HERE, when composing, and not in the runtime: it is a fact of
 * compilation, and the runtime should not have to defend itself from it.
 *
 * Every participant is hydratable by construction and there is no filter for it: a `bus:`
 * binding is hookup, and an `emit(...)` lives in a `@client` body — either one makes the
 * component intrinsically hydratable (`level.ts`).
 */
export function fudBus(graph: ComponentGraph): TagMap {
  /** name → the tags that listen to it, in graph order. */
  const listeners = new Map<string, string[]>();
  /** tag → the names it emits, in source order. */
  const emitted = new Map<string, string[]>();

  for (const comp of allComponents(graph)) {
    walkElements(templateOf(comp), (el) => {
      for (const attr of el.attributes) {
        const b = classifyAttribute(attr, comp.source).value;
        // `bus:(EXPR)` (decision 28.b) carries an expression, not a name: it subscribes at
        // runtime and takes no part here.
        if (b.type !== 'bus' || typeof b.eventName !== 'string') continue;
        const tags = listeners.get(b.eventName) ?? [];
        if (!tags.includes(comp.tag)) tags.push(comp.tag);
        listeners.set(b.eventName, tags);
      }
    });
    const names: string[] = [];
    for (const call of codeOf(comp).emitCalls) {
      if (call.name !== undefined && !names.includes(call.name)) names.push(call.name);
    }
    if (names.length > 0) emitted.set(comp.tag, names);
  }

  const out: Record<string, string[]> = {};
  for (const [tag, names] of emitted) {
    const deps: string[] = [];
    for (const name of names) {
      for (const listener of listeners.get(name) ?? []) {
        if (listener !== tag && !deps.includes(listener)) deps.push(listener);
      }
    }
    if (deps.length > 0) out[tag] = deps;
  }
  return out;
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
  const bus = fudBus(graph);
  if (Object.keys(bus).length > 0) w.line(`const FUD_BUS = ${JSON.stringify(bus)};`);
}
