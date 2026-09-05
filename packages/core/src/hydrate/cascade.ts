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
   * One owner, up — and the owner ALONE, not its subtree.
   *
   * That is the one place the runtime climbs, and it is deliberately not a second cascade.
   * An owner is an ANCESTOR of whoever asked, so preparing its subtree would walk back
   * through the very instance waiting for it and hand that instance a slice pointing at a
   * cell nobody had filled — which is exactly what §4.6 says must not happen. Raising the
   * owner alone puts it in front, and its remaining descendants come up right after through
   * the walk that was already running.
   *
   * Nothing is lost by that inversion: what a descendant would have received from its
   * parent's hookup is the value the SERVER already painted into its own slice, and what
   * moves afterwards travels by cell or by `u`, both of which come later than this.
   */
  const raiseOwner = async (id: number): Promise<void> => {
    if (state.hydrated.has(id)) return;
    const host = byId(id);
    // A marker pointing at an instance no longer in the tree: the page is what it is, and the
    // runtime does not throw over it — the cell simply keeps the value the payload gave it.
    if (host === undefined) return;
    const tag = host.localName;
    const elapsed = stopwatch();
    await loader.ensureDefined(tag);
    attachAll(tag);
    state.hydrated.add(id);
    report(id, tag, elapsed(), 'subtree');
  };

  /**
   * Depth first, then the host itself — and only when it is NOT the root of the walk: the
   * root is the one the caller is about to define (step 5 of §4.4, or `prepareTag`'s own
   * contract).
   */
  const visit = async (host: Element, depth: number): Promise<void> => {
    const shadow = host.shadowRoot;
    if (shadow !== null) {
      for (const childTag of maps.tree[host.localName] ?? []) {
        // One level, inside THIS host's shadow; the recursion enters the next one. Searching
        // from the document would not cross the boundary at all.
        for (const kid of shadow.querySelectorAll(`${childTag}[${ID_ATTR}]`)) {
          await visit(kid, depth + 1);
        }
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

  return { prepareTag, prepareCells, attachAll };
}
