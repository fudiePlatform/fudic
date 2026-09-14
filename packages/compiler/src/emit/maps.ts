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
import { warningDiag, type Diagnostic } from '../types/index.js';
import { codeOf, type ExtractedCode } from './oxc-code.js';
import {
  entryHalf,
  formAssociatedTags,
  isReactiveRoute,
  routeHydration,
  templateOf,
  walkElements,
} from './level.js';
import { entryCellSlots } from './state.js';

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
export function fudTree(
  graph: ComponentGraph,
  hydratable: ReadonlySet<string>,
  routeName?: string,
): TagMap {
  const out: Record<string, string[]> = {};
  for (const comp of allComponents(graph)) {
    if (!hydratable.has(comp.tag)) continue;
    const children = childTags(graph, comp, hydratable);
    if (children.length > 0) out[comp.tag] = children;
  }
  if (routeName !== undefined) {
    const children = routeChildTags(graph, hydratable);
    if (children.length > 0) out[routeName] = children;
  }
  return out;
}

/**
 * The children of a ROUTE — and the rule here is STRICTER than a component's, on purpose
 * (SDD-39 §4.10).
 *
 * A component lists every hydratable tag its template renders; a route lists only the ones it
 * HANDS A PROP TO. `$s()` gives values to the hosts it gives them to and to nobody else, so a
 * component that receives nothing from the route cannot get a `u is not a function` out of it
 * — and with the laxer rule a click on one loose button of the route would raise every island
 * on the page, which is the exact opposite of what this framework does.
 *
 * A `control` counts as a prop: what crosses under it is the model, named at the point of use
 * (decision 112), and the child is downstream of the route for it exactly as for any other.
 */
function routeChildTags(graph: ComponentGraph, hydratable: ReadonlySet<string>): string[] {
  const entry = entryHalf(graph);
  if (entry === undefined) return [];
  const seen = new Set<string>();
  walkElements(entry.roots, (el) => {
    if (seen.has(el.name) || componentOf(graph, el.name) === undefined) return;
    if (!hydratable.has(el.name)) return;
    for (const attr of el.attributes) {
      const b = classifyAttribute(attr, graph.entrySource).value;
      if (b.type === 'property' || b.type === 'control') seen.add(el.name);
    }
  });
  return [...seen];
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
 * Whether a rendered page needs the hydration runtime at all (BUG-31 §T1).
 *
 * The question is «will this document carry a `data-fud-id`, or a container to build»,
 * because those are the two things `fudic-main` looks for. So the answer is the HYDRATABLE
 * SET, not the maps below it: a page can claim three hosts and still publish no `fud-tree` —
 * the tree describes COMPOSITION between hydratable components, and three siblings under
 * plain markup compose with nobody. Reading `hasTree` here left exactly those pages
 * interactive in the HTML and dead in the browser.
 *
 * It is a function of the graph and NOT a by-product of `writeMapConstants`, because the two
 * callers ask at different moments: the head of a standalone page is walked before the maps
 * are written, and the answer has to be the same one either way.
 *
 * It errs toward emitting: a component that is hydratable but never rendered costs a runtime
 * nothing will use, while the opposite costs a page its behaviour.
 */
export function needsRuntime(hydratable: ReadonlySet<string>, hasDi: boolean): boolean {
  return hydratable.size > 0 || hasDi;
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
  routeName?: string,
): PageMaps {
  const tree = fudTree(graph, hydratable, routeName);
  const hasTree = Object.keys(tree).length > 0;
  if (hasTree) w.line(`const FUD_TREE = ${JSON.stringify(tree)};`);
  const bus = fudBus(graph);
  const hasBus = Object.keys(bus).length > 0;
  if (hasBus) w.line(`const FUD_BUS = ${JSON.stringify(bus)};`);
  // `fud-eager` — the ONE list of tags that come up without a gesture (SDD-34 §4.5). It is a
  // flat list and not a map because it answers no question about composition: these tags are
  // defined and hydrated when the runtime installs, and nothing else is.
  //
  // Acted on only where it means something: a tag that never hydrates has no chunk to bring
  // up early, so a `formassociated` component with no hookup at all is not listed. In
  // practice that set is empty — a control-component carries a `control` — and the filter is
  // what keeps the runtime from asking for a chunk that was never emitted.
  // Two reasons to be in it now, and the second is new (SDD-39 §4.6). A `formassociated`
  // component, as before. And anything whose `@code { @client }` calls `effect(...)`: an
  // effect is by definition what happens without anybody touching anything, so one that waits
  // for a gesture is not an effect. It vale for a component and for a route alike — the clock
  // of §6.21 unhydrated paints the server's time and freezes, which is not «works worse».
  const eager = [
    ...new Set([
      ...[...formAssociatedTags(graph)].filter((tag) => hydratable.has(tag)),
      ...allComponents(graph).flatMap((comp) =>
        hydratable.has(comp.tag) && codeOf(comp).clientEffects ? [comp.tag] : [],
      ),
      // The route is in the list under its own NAME, which is how the runtime names it
      // everywhere else: it has no tag to be listed by.
      ...(routeName !== undefined && routeHydration(graph) === 'eager' ? [routeName] : []),
    ]),
  ];
  const hasEager = eager.length > 0;
  if (hasEager) w.line(`const FUD_EAGER = ${JSON.stringify(eager)};`);
  return { hasTree, hasBus, hasEager };
}

/** Which map constants a module actually declared — what the block emitter may reference. */
export interface PageMaps {
  readonly hasTree: boolean;
  readonly hasBus: boolean;
  readonly hasEager: boolean;
}

/**
 * What a REACTIVE route publishes about itself, at the end of the body (SDD-39 §4.2, §4.7).
 *
 * Three things and all three are absent for a route with no client half, which is the base
 * case: a level-1 page costs exactly zero bytes of JavaScript and zero bytes of JSON.
 */
export interface RouteBlocks {
  /** `safeName(pattern)`, the name the runtime derives the chunk URL from. */
  readonly name: string;
  /** The cell declarations of the route's own slice, as `state.ts` laid them out. */
  readonly cells: string;
  /** The expression `fud-data` carries, or `null` when the client half never reads it. */
  readonly data: string | null;
}

/**
 * The route's own three, written INSIDE the same guard as the rest (§4.7).
 *
 * The claim goes first and it is what makes the guard true: `blocks()` runs when the body is
 * finished, so the `<body>` takes the LAST id of the page rather than the first. That breaks
 * the pre-order `registry.ts` describes, and it is accepted on purpose — `idOf` reads the
 * attribute, `fud-state` is positional by id, a cell address is `[id, slot]`, and the order
 * `allInstances` returns only decides the order the warm observer looks at things in.
 */
function writeRouteBlocks(w: CodeWriter, route: RouteBlocks, dom: string, parent: string): void {
  w.line(`jsonBlock(${dom}, ${parent}, ${JSON.stringify(ROUTE_BLOCK)}, ${JSON.stringify(route.name)});`);
  if (route.data !== null) {
    w.line(`jsonBlock(${dom}, ${parent}, ${JSON.stringify(DATA_BLOCK)}, ${route.data});`);
  }
}

/** The two ids SDD-39 adds, declared here beside the four that were already written. */
const ROUTE_BLOCK = 'fud-route';
const DATA_BLOCK = 'fud-data';

/** A client half that reads `data` where nothing ever ran `load` (SDD-39 §4.8). */
const FUD_DATA_WITHOUT_LOAD = 'FUD0621';

/**
 * What this route publishes about itself, or `undefined` when it publishes nothing.
 *
 * Two conditions and both are needed. The route has to HAVE a client half, or there is
 * nothing for an id to identify. And the build has to know what the route is CALLED, because
 * the name is what the runtime derives the chunk URL from — a standalone emit has no routing
 * and no chunks, so an id there would be an attribute nobody reads (§4.7).
 */
export function routeBlocksOf(
  graph: ComponentGraph,
  routeName: string | undefined,
  out: Diagnostic[],
): RouteBlocks | undefined {
  const entry = entryHalf(graph);
  if (entry === undefined || routeName === undefined || !isReactiveRoute(graph)) return undefined;
  const cells = entryCellSlots(graph, entry);
  return {
    name: routeName,
    // The same two shapes the component's `writeState` writes, and from the same list: a
    // signal hands over its live object and the value it serialises as, a callback has none.
    cells: cells
      .map((c) => (c.kind === 'signal' ? `{ of: ${c.name}, value: ${c.name}() }` : `{ of: ${c.name} }`))
      .join(', '),
    data: dataExpression(entry.code, out),
  };
}

/**
 * The expression `fud-data` carries — what `load()` returned, TRIMMED to what the client half
 * reads (SDD-39 §4.8).
 *
 * Three answers, and the first is the common one. A client half that never names `data` gets
 * no block at all: a `data` only the server paints does not cost a byte. One that reads it by
 * static roots gets those roots and nothing else, so a `load` returning a session token beside
 * a user name publishes the name. And one that reads it in a way no AST can bound — `data[k]`,
 * or `data` handed to a function — sends the object whole, with NO diagnostic: a warning there
 * would fire for writing correct JavaScript.
 *
 * `?.` on every root, because the one case that is knowable IS reported: a route that reads
 * `data` and declares no `load` finds `undefined` there forever (`FUD0621`), and the emit must
 * not turn that into a throw while it says so.
 */
function dataExpression(code: ExtractedCode, out: Diagnostic[]): string | null {
  const access = code.dataAccess;
  if (access.kind === 'none') return null;
  if (!code.serverExports.includes('load')) {
    out.push(
      warningDiag(
        FUD_DATA_WITHOUT_LOAD,
        'The client half reads `data` and this route declares no `load`: what it finds there is `undefined`, always.',
        access.at,
      ),
    );
  }
  if (access.kind === 'all') return 'data';
  return `{ ${access.roots.map((r) => `${JSON.stringify(r)}: data?.${r}`).join(', ')} }`;
}

/**
 * The `<body>`'s own identity, taken before the payload is read (SDD-39 §4.2).
 *
 * It is the route's `data-fud-id` and the index of its slice, and it is claimed here because
 * this is the one point where `$parent` IS the `<body>` — only the outermost layout knows
 * where the body ends (SDD-21 §4.5). `stateOf` and not `state`: a route holds the node
 * itself, not a shadow that leads to it.
 */
export function writeRouteClaim(w: CodeWriter, route: RouteBlocks, dom: string, parent: string): void {
  w.line(`${dom}.claim(${parent});`);
  w.line(`${dom}.stateOf(${parent}, [], [${route.cells}]);`);
}

/**
 * The three `<script type="application/json">` blocks, hung off the body right before it is
 * serialized (SDD-15 §3.3–§3.5).
 *
 * They go at the END OF THE BODY and as real nodes, not as text yielded beside it. `page`
 * cedes the `<head>` first and builds the body afterwards, so `fud-state` could not live in
 * the head — it does not exist yet. And going through the tree means one serialization and
 * one escaping discipline (`jsonBlock`, `@fudic/ssr`).
 *
 * `fud-tree` and `fud-bus` are static and could have gone in the head. They travel with the
 * other one because the three are the SAME fact for the runtime, and splitting them by an
 * accident of streaming invites reading them at two different moments.
 *
 * **What is empty is not emitted.** A page that claimed NO instance publishes none of the
 * three — not even the two static maps, which would then describe a hydration that has
 * nothing to hydrate. A `{}` is a fetch and a parse for nothing, and the runtime has to
 * handle the absence anyway: a zero-JS page is the base case of the framework, not an
 * exception.
 *
 * And that emptiness is a RUNTIME fact, which is why the guard is an `if` in the emitted code
 * and not one here: a page whose only hydratable component sits behind a false `@if` renders
 * no instance, and the compiler cannot know. The two maps DO get their compile-time check as
 * well — no constant, no call — because a flat page has no `fud-tree` and a page with no bus
 * has no `fud-bus`, whatever it renders.
 */
export function writeHydrationBlocks(
  w: CodeWriter,
  maps: PageMaps,
  dom: string,
  parent: string,
  ioc?: string,
  route?: RouteBlocks,
): void {
  // The route claims the `<body>` BEFORE the payload is read, or its own slice would not be
  // in the state it is about to serialise (SDD-39 §4.2).
  if (route !== undefined) writeRouteClaim(w, route, dom, parent);
  w.line(`const $state = ${dom}.hydrationState();`);
  w.line('if ($state.offsets.length > 1) {');
  w.indent();
  w.line(`jsonBlock(${dom}, ${parent}, 'fud-state', [$state.offsets, $state.data]);`);
  if (maps.hasTree) w.line(`jsonBlock(${dom}, ${parent}, 'fud-tree', FUD_TREE);`);
  if (maps.hasBus) w.line(`jsonBlock(${dom}, ${parent}, 'fud-bus', FUD_BUS);`);
  if (maps.hasEager) w.line(`jsonBlock(${dom}, ${parent}, 'fud-eager', FUD_EAGER);`);
  if (route !== undefined) writeRouteBlocks(w, route, dom, parent);
  if (ioc !== undefined) writeIocBlocks(w, dom, parent, ioc);
  w.dedent();
  w.line('}');
}

/**
 * The two blocks of SDD-38, and neither is a compile-time constant.
 *
 * `fud-ioc` is the container tree AS RENDERED: two instances of one owning tag are two
 * owners, so it is the only page map whose size follows the instances rather than the
 * catalogue — which is why the pruning of §4.5 matters, and why only a container that OWNS
 * providers gets a node at all. A map with nothing but the root says nothing the browser
 * cannot assume, so it is not written.
 *
 * `fud-di` is what this request PUBLISHED. Only that crosses: a value seeded on the server
 * and not published stays there, which is what makes a `@server` region safe to inject from.
 */
function writeIocBlocks(w: CodeWriter, dom: string, parent: string, ioc: string): void {
  w.line(`const $iocMap = ${ioc}.map();`);
  w.line(`if ($iocMap[0].length > 1) jsonBlock(${dom}, ${parent}, 'fud-ioc', $iocMap);`);
  w.line(`const $seed = publishedSeed(${ioc});`);
  w.line(`if ($seed !== null) jsonBlock(${dom}, ${parent}, 'fud-di', $seed);`);
}
