/**
 * Raising an instance NOBODY PAINTED — the other half of `FudicElement`'s two entry points.
 *
 * Everything the cascade raises came from the server: it carries a `data-fud-id`, the page
 * map names its tag and the runtime hands it its slice of the payload (SDD-17). A component
 * that first exists in the browser — a `<x-item>` inside a `@foreach` whose list just grew —
 * has none of that. Nothing painted it, so no map names it and no payload holds it, and the
 * only code that knows it exists is the parent that fabricated it.
 *
 * So the parent raises it, and this is the one line of runtime that lets it: the parent's
 * chunk has the element and the props, and what it lacks is the child's DEFINITION, which is
 * a download and therefore the runtime's business. `live` bridges exactly that gap and
 * nothing else — it never reads the DOM to decide anything, and it never asks who the
 * parent is.
 *
 * **What this module does NOT hold is where a tag comes from.** The definer and the registry
 * of the page live in `registry.js`, published there by hydration and read from here (SDD-45
 * §4.4.1). Holding them here meant hydration had to import this module to fill them in, and
 * then every page that hydrates downloaded a bridge it may never cross. Reading them makes
 * this piece optional for real: the only code that imports it is the chunk of a component
 * that fabricates, and it travels with that chunk.
 */

import { pageElements, tagDefiner, type ElementRegistry } from './registry.js';
import { createdBy } from './scope.js';

// What an instance created here resolves its services from travels with this piece: every chunk
// that creates reaches it, and so does every chunk that injects (SDD-85).
export { ownScope, scopeOf, SCOPE_ATTR } from './scope.js';

/** What an upgraded instance offers a parent: entry point 2 (SDD-15 §3.7). */
interface FabricatedHost extends Element {
  c(props: readonly unknown[]): void;
}

/** And entry point 3, which a parent calls on it from then on: `u`, with the payload's two leading holes. */
interface UpdatedHost {
  u(props: readonly unknown[]): void;
}

/** The slots before the props in what `u` takes: `$dom` and `$shadow`. */
const PAYLOAD_OFFSET = 2;

/**
 * Raised already, so a parent that fabricates and then re-runs its own creation path cannot
 * hand one element two controllers. A `WeakSet` and not a flag on the element: nothing this
 * runtime does may be observable as an attribute of somebody's component.
 */
const raised = new WeakSet<Element>();

/**
 * Bring a fabricated host to life with the props its parent composed.
 *
 * Synchronous when the tag is already defined — which is the common case, because the page
 * that fabricates the second instance of a tag already downloaded it for the first — and a
 * download otherwise. `props` is the positional array `c` takes, in the child's declared
 * prop order, with `$dom` and `$shadow` left to `FudicElement` itself. `from` is the shadow
 * root of the component that created it, when one did (`scope.ts`).
 */
export function live(host: Element, props: readonly unknown[], from?: ShadowRoot): void {
  if (raised.has(host)) return;
  raised.add(host);
  // The view that created it: what it resolves its services from goes through that one.
  if (from !== undefined) createdBy(host, from.host);
  const tag = host.localName;
  const registry = pageElements();
  if (registry.get(tag) !== undefined) {
    raise(host, props, registry);
    return;
  }
  // While its definition downloads, the parent goes on handing it values: at its own hookup, and
  // whenever what it hands over moves. An element with no definition has no `u` to take them, so
  // it gets one that keeps them, and it is raised with the props as they stand by then.
  const waiting = [...props];
  const early = host as unknown as Partial<UpdatedHost>;
  // Only the slots it carries: the payload is sparse, and its two leading holes are never there.
  early.u = (next) => {
    for (const key of Object.keys(next)) waiting[Number(key) - PAYLOAD_OFFSET] = next[Number(key)];
  };
  const define = tagDefiner();
  const pending = define === null ? registry.whenDefined(tag) : define(tag);
  void pending.then(() => {
    // The class's own `u` from here on.
    delete early.u;
    raise(host, waiting, registry);
  });
}

function raise(host: Element, props: readonly unknown[], registry: ElementRegistry): void {
  // An element created before its definition existed is inert until it is upgraded, and a
  // fabricated one is never connected at that moment — `upgrade` is what makes the class
  // take over without waiting for the parent to mount it. A no-op on one already upgraded.
  registry.upgrade(host);
  (host as FabricatedHost).c(props);
}
