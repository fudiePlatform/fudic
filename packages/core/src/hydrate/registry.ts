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
 * The hydratable instances of ONE tag, shadow roots included.
 *
 * By tag and not by instance, because `customElements.define` upgrades every instance of a
 * tag at once: the preparation of the subtree and the handout of the payload have to reach
 * all of them before any one receives an interaction (SDD-17 §4.4).
 */
export function instancesOf(tag: string, root: ParentNode): readonly Element[] {
  const out: Element[] = [];
  collect(root, (el) => el.localName === tag && el.hasAttribute(ID_ATTR), out);
  return out;
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
