// Finding hydratable instances. `querySelectorAll` does not cross a shadow boundary, so every
// walk enters each open shadow root explicitly. The order is shadow-inclusive pre-order: a
// host, then its shadow, then its siblings, which is the order the server numbered them in.

/** The identity attribute of a hydratable instance. */
export const ID_ATTR = 'data-fud-id';

/** The element a route adopts from. A custom element needs a dash, so no tag can be `body`. */
export const ROUTE_HOST = 'body';

/** The id of a hydratable host. Callers only reach hosts through `[data-fud-id]`. */
export function idOf(host: Element): number {
  return Number(host.getAttribute(ID_ATTR));
}

function collect(root: ParentNode, keep: (el: Element) => boolean, out: Element[]): void {
  for (const el of root.querySelectorAll('*')) {
    if (keep(el)) out.push(el);
    if (el.shadowRoot !== null) collect(el.shadowRoot, keep, out);
  }
}

/** Every hydratable instance under `root`, shadow roots included. */
export function allInstances(root: ParentNode): readonly Element[] {
  const out: Element[] = [];
  collect(root, (el) => el.hasAttribute(ID_ATTR), out);
  return out;
}

// One gesture walks the document once and every finder reads that index. It lives only as
// long as the gesture: a longer-lived index would go stale as nodes are inserted.
interface TurnIndex {
  readonly root: ParentNode;
  readonly byId: ReadonlyMap<number, Element>;
  readonly byTag: ReadonlyMap<string, readonly Element[]>;
}

let turn: TurnIndex | null = null;

/**
 * Indexes `root` for one gesture and returns how to close the index. Closing only clears
 * this index: an overlapping gesture's newer index answers the older one correctly too.
 */
export function openTurn(root: ParentNode): () => void {
  const byId = new Map<number, Element>();
  const byTag = new Map<string, Element[]>();
  for (const el of allInstances(root)) {
    byId.set(idOf(el), el);
    const same = byTag.get(el.localName);
    if (same === undefined) byTag.set(el.localName, [el]);
    else same.push(el);
  }
  const mine: TurnIndex = { root, byId, byTag };
  turn = mine;
  return () => {
    if (turn === mine) turn = null;
  };
}

function indexFor(root: ParentNode): TurnIndex | null {
  return turn !== null && turn.root === root ? turn : null;
}

/** The hydratable instances of one tag, shadow roots included. */
export function instancesOf(tag: string, root: ParentNode): readonly Element[] {
  const index = indexFor(root);
  if (index !== null) return index.byTag.get(tag) ?? [];
  const out: Element[] = [];
  collect(root, (el) => el.localName === tag && el.hasAttribute(ID_ATTR), out);
  return out;
}

/** The instance with this id, shadow roots included. */
export function instanceById(id: number, root: ParentNode): Element | undefined {
  const index = indexFor(root);
  if (index !== null) return index.byId.get(id);
  return allInstances(root).find((el) => idOf(el) === id);
}

/**
 * `hydrated`: instances the runtime already acted on, which decides how a gesture is handled.
 * `attached`: instances already handed their state. An instance can be attached and not
 * hydrated when another instance's gesture defined its tag.
 */
export interface InstanceState {
  readonly hydrated: Set<number>;
  readonly attached: Set<number>;
}

export function instanceState(): InstanceState {
  return { hydrated: new Set<number>(), attached: new Set<number>() };
}
