/**
 * The scope a component renders in — what its services resolve from — for an instance the
 * BROWSER created (SDD-85, decided with Pedro on 2026-11-16).
 *
 * The server hands every `render` the container it resolves from, and a component that owns one
 * hands its own to everything its view renders. A painted instance gets the same answer in the
 * browser from its payload: the node of the page's tree it stood at. An instance the browser
 * created has no payload, and it used to resolve from the root: a `<di-panel>` created inside a
 * `<di-owner>` could not find the `Cart` the owner provides.
 *
 * So the browser follows the same chain the server does — the VIEW a host is rendered by, not
 * the DOM it sits in — and stops at the first component that owns a scope:
 *
 * - a host created at runtime is in the view of the component that created it (`createdBy`,
 *   which `live` records: the clone of a block is a fragment, out of any tree, until it mounts);
 * - a painted host is in the view of the host of the shadow root that holds it, or in the page's;
 * - a painted owner carries its node of the page's tree on its host (`SCOPE_ATTR`, written by
 *   the server); an owner created here opens its own (`ownScope`).
 *
 * What a scope IS is not this module's business: it holds whatever the owner opened, and a
 * painted node as its number. The chunk turns either into a container (`@fudic/di/page`).
 */

/** The attribute a painted owner's host carries: its node of the page's container tree. */
export const SCOPE_ATTR = 'data-fud-ioc';

/** A host created at runtime → the host of the component that created it. */
const creators = new WeakMap<Element, Element>();

/** The host of an owner created at runtime → the scope it opened. */
const owned = new WeakMap<Element, unknown>();

/** Record that `creator`'s view created `host`: `live` does, as it raises it. */
export function createdBy(host: Element, creator: Element): void {
  creators.set(host, creator);
}

/** The host of the component whose view renders `el`, or `null` for the page's own markup. */
function viewOf(el: Element): Element | null {
  const creator = creators.get(el);
  if (creator !== undefined) return creator;
  const root = el.getRootNode() as Node & { readonly host?: Element };
  return root.host ?? null;
}

/** The scope a view renders in: the first owner from `el` out, or `undefined` for the root. */
function scopeFrom(el: Element | null): unknown {
  for (let at = el; at !== null; at = viewOf(at)) {
    if (owned.has(at)) return owned.get(at);
    const painted = at.getAttribute(SCOPE_ATTR);
    if (painted !== null) return Number(painted);
  }
  return undefined;
}

/** The scope `host` is rendered in: what an instance with no payload node resolves from. */
export function scopeOf(host: Element): unknown {
  return scopeFrom(viewOf(host));
}

/**
 * The scope an OWNER hands its view. Painted, it is the node the server wrote on its host.
 * Created here, `open` makes it from the scope around it — a child container, with the owner's
 * providers in it — and its view resolves from it from then on.
 */
export function ownScope(host: Element, open: (outer: unknown) => unknown): unknown {
  const painted = host.getAttribute(SCOPE_ATTR);
  if (painted !== null) return Number(painted);
  const scope = open(scopeOf(host));
  owned.set(host, scope);
  return scope;
}
