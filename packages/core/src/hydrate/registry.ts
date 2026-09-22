/**
 * Finding hydratable instances, and the two sets that govern everything (SDD-17 §4.1, §4.4).
 *
 * **The walk descends through `shadowRoot`, never through `document` alone.**
 * `querySelectorAll` does not cross a shadow boundary, so every level enters its own shadow
 * explicitly and recurses. That is what requires the declarative shadow roots to be `open`,
 * which the emit guarantees (SDD-17 §5); a `closed` component is out of scope (§8).
 *
 * The order is shadow-inclusive PRE-ORDER — a host, then its shadow, then its siblings —
 * which is the same order the server assigned the ids in (SDD-15 §3.2).
 *
 * **Two sets, and confusing them breaks path 3** (SDD-17 §4.4). `hydrated` holds the
 * instances the runtime has already intervened on and governs the three paths; `attached`
 * holds the instances that were already handed their payload slice and governs the handout.
 * A sibling instance ends up `attached` without being `hydrated` — its tag was defined by
 * another instance's click — and that is exactly why its own first click still reports
 * `from: 'shared-chunk'` instead of passing unnoticed.
 */

/** The identity attribute of a hydratable instance (SDD-15 §3.1). */
export const ID_ATTR = 'data-fud-id';

/**
 * The element a ROUTE adopts from (SDD-39 §4.2).
 *
 * The `<body>` and nothing else: a route has no element of its own and cannot be given one —
 * that would be a custom element spending most of its life in `:not(:defined)` — and the only
 * node a layout is obliged to write is the body. It is safe to recognise by name because a
 * custom element needs a dash, so `body` is a tag no component can ever have.
 */
export const ROUTE_HOST = 'body';

/**
 * The slice of `CustomElementRegistry` the runtime uses — and the single platform fact the
 * whole cascade is built on: `define` upgrades EVERY instance of a tag already in the tree,
 * shadow roots included, in place and keeping each instance's declarative shadow root.
 *
 * A port, injected, for the same reason the router's clock and network are (SDD-20): the
 * runtime is then verifiable without depending on how faithfully a DOM emulation reproduces
 * that rule. `define` itself is absent on purpose — the runtime never defines anything; a
 * chunk does, as the side effect of being evaluated.
 */
export interface ElementRegistry {
  get(name: string): CustomElementConstructor | undefined;
  whenDefined(name: string): Promise<unknown>;
  upgrade(node: Node): void;
}

/**
 * The platform's own registry. An object literal and not `customElements` itself, so that
 * importing `@fudic/core` outside a browser — the `@server` region of a page reaches for
 * `strategy` from this same entry point — does not touch a global that is not there.
 */
export const browserRegistry: ElementRegistry = {
  get: (name) => customElements.get(name),
  whenDefined: (name) => customElements.whenDefined(name),
  upgrade: (node) => {
    customElements.upgrade(node);
  },
};

/** How this page defines a tag: a download, so it belongs to hydration and to nobody else. */
export type DefineTag = (tag: string) => Promise<void>;

/**
 * Where a tag comes from, for this page — published by hydration, read by whoever needs to
 * bring up an element nobody painted (`live`).
 *
 * **It lives in this module because of SDD-45 §4.4.1, and that is the whole reason.** The
 * fabricated-child bridge used to hold this pair itself, and hydration pushed it in by
 * importing the bridge — which put `core/live` in the load of every page that hydrates, for a
 * bridge most pages never cross. With the seam here, nothing in the load names it: the bridge
 * arrives inside the chunk of the component that fabricates, which is the only code that
 * imports it, and `core/live` is optional FOR REAL rather than merely late.
 *
 * Here and not in a piece of its own for the second rule of §4.3: this module is already
 * reached by hydration and by the bridge, and its frontier is already paid.
 *
 * **Module state, and here that is sound.** A browser module lives in one page, the definer
 * is that page's, and a second page is a second realm. A page that never installs hydration
 * keeps the platform registry and no definer, which is the honest degraded behaviour: a
 * fabricated element comes alive if something else defines its tag.
 */
let pageDefine: DefineTag | null = null;
let pageRegistry: ElementRegistry = browserRegistry;

/** Called once by `installHydration`, which owns the chunk loader and the injected registry. */
export function publishTagSource(define: DefineTag, elements: ElementRegistry): void {
  pageDefine = define;
  pageRegistry = elements;
}

/** How this page downloads a definition, or `null` when nothing installed hydration. */
export function tagDefiner(): DefineTag | null {
  return pageDefine;
}

/** The registry this page's elements live in — the platform's until hydration says otherwise. */
export function pageElements(): ElementRegistry {
  return pageRegistry;
}

/** Why an instance came up: the `from` of `fud:hydrated` (SDD-17 §3). */
export type HydratedFrom = 'downloaded' | 'shared-chunk' | 'bus' | 'subtree';

/** How a collaborator announces that one instance is live. */
export type ReportHydrated = (id: number, tag: string, ms: string, from: HydratedFrom) => void;

/**
 * A stopwatch for the `ms` of `fud:hydrated`, in the one format the event declares — so the
 * three places that report cannot disagree on the shape of the field they publish.
 */
export function stopwatch(): () => string {
  const start = performance.now();
  return () => (performance.now() - start).toFixed(1);
}

/**
 * The id of a hydratable host. Total by construction: every caller reaches a host through a
 * selector that already demanded `[data-fud-id]`.
 */
export function idOf(host: Element): number {
  return Number(host.getAttribute(ID_ATTR));
}

/** Walk `root` and everything inside its shadow roots, collecting what `keep` accepts. */
function collect(root: ParentNode, keep: (el: Element) => boolean, out: Element[]): void {
  for (const el of root.querySelectorAll('*')) {
    if (keep(el)) {
      out.push(el);
    }
    if (el.shadowRoot !== null) {
      collect(el.shadowRoot, keep, out);
    }
  }
}

/** Every hydratable instance under `root`, shadow roots included. */
export function allInstances(root: ParentNode): readonly Element[] {
  const out: Element[] = [];
  collect(root, (el) => el.hasAttribute(ID_ATTR), out);
  return out;
}

/**
 * The index of ONE hydration turn (SDD-45 §4.12): the walk, done once, read many times.
 *
 * Every finder below used to walk the whole document — across every shadow root — on each
 * call, and the runtime calls them INSIDE the gesture: once per tag in the cascade, once per
 * receiver on the bus, and a whole pass to locate ONE element by its id. A click on a tree of
 * N instances was N+ full walks of the document.
 *
 * **Per turn, and deliberately not global.** A global index would have to be kept alive
 * against everything that inserts nodes afterwards — the fabricator in `live`, the worker's
 * render, the user's own script — and a stale index is a silent wrong answer where today
 * there is a slow correct one. This one is born with the gesture and dies with it: it cannot
 * age. It also carries the root it was built for, so a finder asked about a different subtree
 * walks instead of answering from the wrong tree.
 */
interface TurnIndex {
  readonly root: ParentNode;
  readonly byId: ReadonlyMap<number, Element>;
  readonly byTag: ReadonlyMap<string, readonly Element[]>;
}

let turn: TurnIndex | null = null;

/**
 * Open a turn over `root` and return how to close it.
 *
 * Closing only clears an index that is still THIS one. Two gestures can overlap — the first
 * is awaiting its chunk when the second starts — and the second's index is a fresher snapshot
 * of the same tree, so it answers the first correctly too. Restoring the older one on close
 * would be the only way to hand back something stale.
 */
export function openTurn(root: ParentNode): () => void {
  const byId = new Map<number, Element>();
  const byTag = new Map<string, Element[]>();
  // ONE walk, and in the order everything downstream already depends on: `allInstances` is
  // shadow-inclusive pre-order, a `Map` keeps insertion order, so every list below comes out
  // in that same order. SDD-17's order is not touched here — it is copied.
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

/** The open turn, if it is about this very root. */
function indexFor(root: ParentNode): TurnIndex | null {
  return turn !== null && turn.root === root ? turn : null;
}

/**
 * The hydratable instances of ONE tag, shadow roots included.
 *
 * By tag and not by instance, because `customElements.define` upgrades every instance of a
 * tag at once: the preparation of the subtree and the handout of the payload have to reach
 * all of them before any one receives an interaction (SDD-17 §4.4).
 *
 * Inside a turn this is a map lookup; outside one it is the walk it always was.
 */
export function instancesOf(tag: string, root: ParentNode): readonly Element[] {
  const index = indexFor(root);
  if (index !== null) return index.byTag.get(tag) ?? [];
  const out: Element[] = [];
  collect(root, (el) => el.localName === tag && el.hasAttribute(ID_ATTR), out);
  return out;
}

/**
 * The instance of an id, wherever it lives — shadow roots included.
 *
 * It is the finder the old code paid most for: `allInstances(root).find(…)` walked the entire
 * document to reach one element, once per owner a climb had to raise.
 */
export function instanceById(id: number, root: ParentNode): Element | undefined {
  const index = indexFor(root);
  if (index !== null) return index.byId.get(id);
  return allInstances(root).find((el) => idOf(el) === id);
}

/** The two sets of §4.4, created together so they cannot be mistaken for one. */
export interface InstanceState {
  /** Instances the runtime already intervened on. Governs the three paths (§4.3). */
  readonly hydrated: Set<number>;
  /** Instances already handed their payload slice. Governs the handout (§4.4). */
  readonly attached: Set<number>;
}

export function instanceState(): InstanceState {
  return { hydrated: new Set<number>(), attached: new Set<number>() };
}
