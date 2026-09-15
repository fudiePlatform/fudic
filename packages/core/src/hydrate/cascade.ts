/**
 * The composition cascade, in strict POST-ORDER, and its correction BY TAG (SDD-17 §4.4).
 *
 * Clicking inside a host that is not hydrated is not enough to raise the host: its whole
 * subtree of hydratable descendants has to be alive BEFORE the host mounts and its handler
 * runs, because the parent's emitted code passes state and props to the children IT mounts.
 * So the deepest descendant goes first and the host goes last; the runtime only guarantees
 * the ORDER — the data crossing is the emitted code's business.
 *
 * ## The two corrections the fusion of the prototypes exposed
 *
 * **`prepareTag`, not `hydrateSubtreePostorder` alone.** `customElements.define` upgrades
 * EVERY instance of a tag in the tree, shadow roots included — not only the one that was
 * clicked. Preparing just the clicked host's subtree would leave every sibling instance
 * upgraded over a dead subtree, and post-order violated for them. That is precisely the
 * instance that later arrives at path 3, where nothing can be repaired: its
 * `connectedCallback` already ran. With `prepareTag`, path 3 is a no-op that is CORRECT;
 * without it, a no-op that is silently wrong.
 *
 * **`attachAll`, for the same reason.** A component does not know its own `data-fud-id`
 * (SDD-17 §3), so it cannot read its own slice of the payload: the runtime hands it over.
 * And the handout is per tag too — handing the slice only to the clicked instance would
 * leave its siblings upgraded and UNATTACHED, and their first click falls into path 3,
 * which by definition downloads nothing and repairs nothing.
 */

import { type PageMaps } from './maps.js';
import { type Cells } from './cells.js';
import { type ChunkLoader } from './chunks.js';
import {
  allInstances,
  ID_ATTR,
  idOf,
  instancesOf,
  stopwatch,
  type ElementRegistry,
  type InstanceState,
  type ReportHydrated,
} from './registry.js';

/** What an upgraded instance offers the runtime: entry point 1 (SDD-15 §3.7, §4.3). */
interface HydratableHost extends Element {
  h(props: readonly unknown[]): void;
}

export interface CascadeConfig {
  readonly maps: PageMaps;
  /**
   * The page's cell registry (BUG-24 §4.3). A port like `registry` and `loader`, so the
   * runtime stays verifiable with no DOM: what it decides is which object an instance is
   * handed, and that is exactly the thing under test.
   */
  readonly cells: Cells;
  readonly loader: ChunkLoader;
  readonly registry: ElementRegistry;
  readonly state: InstanceState;
  /** Where instances are looked up from: the document of the page. */
  readonly root: ParentNode;
  readonly report: ReportHydrated;
}

export interface Cascade {
  /**
   * Prepare the subtree of EVERY instance of `tag`, in post-order, leaving each subtree
   * root itself untouched — whoever asked for the tag defines it afterwards.
   */
  prepareTag(tag: string): Promise<void>;
  /**
   * Raise the OWNER of every empty cell the instances of `tag` depend on (BUG-24 §4.6).
   *
   * It goes BEFORE the handout, in the same place of path 2 where the bus goes before the
   * cascade (SDD-17 §4.4), and for the same kind of reason: an empty cell is a dependency,
   * and the child cannot be given a slice that points at something nobody has filled yet.
   */
  prepareCells(tag: string): Promise<void>;
  /**
   * Prepare what the ROUTE hands values to, in post-order, leaving the route itself untouched
   * (SDD-39 §4.10). `name` is the route's own name — what `fud-tree` filed its children under.
   */
  prepareRoute(name: string, host: Element): Promise<void>;
  /** Hand every instance of `tag` its slice of the payload, once. */
  attachAll(tag: string): void;
}

export function createCascade(config: CascadeConfig): Cascade {
  const { maps, cells, loader, registry, state, root, report } = config;

  const attachAll = (tag: string): void => {
    for (const host of instancesOf(tag, root)) {
      const id = idOf(host);
      if (state.attached.has(id)) {
        continue;
      }
      state.attached.add(id);
      // Idempotent after a `define` that already upgraded the tree, and it armours the
      // order: whatever the caller did, the instance is a live element before it is handed
      // its state.
      registry.upgrade(host);
      // RESOLVED, never raw: a marker becomes the cell it names, and a slot of this
      // instance's own that some consumer named becomes that same cell. The component still
      // does not know its `data-fud-id` (SDD-17 §3) — the substitution is the runtime's, and
      // the chunk only ever sees a `Signal` where it used to see a number.
      (host as HydratableHost).h(cells.resolve(id));
    }
  };

  /** The instance of an id, wherever it lives — `allInstances` crosses shadow roots. */
  const byId = (id: number): Element | undefined =>
    allInstances(root).find((el) => idOf(el) === id);

  const prepareCells = async (tag: string): Promise<void> => {
    for (const host of instancesOf(tag, root)) {
      if (state.attached.has(idOf(host))) continue;
      for (const [owner] of cells.eager(idOf(host))) {
        await raiseOwner(owner);
      }
    }
  };

  /**
   * The owners a climb is already on the way to, so a descendant reached by that climb cannot
   * ask for the same owner again and start it a second time.
   *
   * It is not an optimisation. Raising an owner walks its subtree, and that subtree contains
   * the very instance whose empty cell asked for the climb: without this, `prepareCells` on
   * the way down would call `raiseOwner` on the way up, forever.
   */
  const raising = new Set<number>();

  /**
   * One owner, up — with its SUBTREE, in the same post-order everything else uses.
   *
   * This is the one place the runtime climbs, and it climbs the whole way: an owner is an
   * ancestor of whoever asked, so raising it means raising a host, and a host may not come up
   * over dead children. That is not a preference — `FudicElement.u` is a tolerant no-op only
   * for an instance that has been UPGRADED, and an element whose tag was never defined is a
   * plain `HTMLElement` with no `u` on it at all. The owner's hookup hands every child host
   * its slice, so raising the owner alone threw `u is not a function` on the first sibling
   * that was not the one that asked, and the gesture died with it.
   *
   * An earlier reading had it the other way round — the owner ALONE, on the argument that
   * walking its subtree would hand the waiting instance a slice pointing at a cell nobody had
   * filled. The premise is right and the conclusion does not follow: a cell is READ AT THE
   * MOMENT IT IS CALLED (BUG-24 §4.6), so a slice handed over early is a slice pointing at a
   * cell that is still empty AND WILL BE FILLED before anything reads it — which is the whole
   * reason the read was deferred to dispatch. Nothing needs the owner to jump the queue.
   *
   * `prepareTag` and not this instance's subtree alone, for the reason stated at the top of
   * this file: `attachAll` is per TAG, so what it attaches has to be prepared per tag too.
   */
  const raiseOwner = async (id: number): Promise<void> => {
    if (state.hydrated.has(id) || raising.has(id)) return;
    const host = byId(id);
    // A marker pointing at an instance no longer in the tree: the page is what it is, and the
    // runtime does not throw over it — the cell simply keeps the value the payload gave it.
    if (host === undefined) return;
    raising.add(id);
    try {
      const tag = host.localName;
      const elapsed = stopwatch();
      await prepareTag(tag);
      await loader.ensureDefined(tag);
      attachAll(tag);
      state.hydrated.add(id);
      report(id, tag, elapsed(), 'subtree');
    } finally {
      raising.delete(id);
    }
  };

  /**
   * Depth first, then the host itself — and only when it is NOT the root of the walk: the
   * root is the one the caller is about to define (step 5 of §4.4, or `prepareTag`'s own
   * contract).
   */
  const visit = async (host: Element, depth: number, key = host.localName): Promise<void> => {
    // Down the shadow when there is one, down the LIGHT when there is not (SDD-39 §4.10). A
    // component always has one — the parser materialises a declarative shadow root whether or
    // not the tag is defined — so the second half is the route's: its root is the `<body>`,
    // which has no shadow and holds its children directly.
    //
    // `key` is how the tree is looked up, and it is the `localName` for every host there is
    // except one: a route has no tag, so what names its entry is the route's own name.
    const scope = host.shadowRoot ?? host;
    for (const childTag of maps.tree[key] ?? []) {
      // One level, inside THIS host's scope; the recursion enters the next one. Searching
      // from the document would not cross the boundary at all.
      for (const kid of scope.querySelectorAll(`${childTag}[${ID_ATTR}]`)) {
        await visit(kid, depth + 1);
      }
    }
    if (depth === 0) {
      return;
    }
    const id = idOf(host);
    if (state.hydrated.has(id)) {
      return;
    }
    const tag = host.localName;
    const elapsed = stopwatch();
    await loader.ensureDefined(tag); // download per tag, memoized
    await prepareCells(tag); // the owner of every empty cell, before the handout
    attachAll(tag); // upgrade + slice, per instance
    state.hydrated.add(id);
    report(id, tag, elapsed(), 'subtree');
  };

  const prepareTag = async (tag: string): Promise<void> => {
    for (const host of instancesOf(tag, root)) {
      await visit(host, 0);
    }
  };

  /**
   * The subtree of the ROUTE, in the same post-order (SDD-39 §4.10).
   *
   * One host and not a list: there is exactly one route per page, and the caller holds the
   * node — the `<body>` — because that is what carried the `data-fud-id` the gesture landed
   * on. What it descends by is the route's NAME, which is what `fud-tree` filed its children
   * under, and those children are only the ones the route hands a prop to: `$s()` gives
   * values to the hosts it gives them to and to nobody else, so raising the rest would be
   * lighting up every island on the page over one click on a loose button.
   */
  const prepareRoute = async (name: string, host: Element): Promise<void> => {
    await visit(host, 0, name);
  };

  return { prepareTag, prepareCells, prepareRoute, attachAll };
}
