// Brings components up in post-order: every hydratable descendant before its host, because
// a host hands state to the children it mounts. Everything is done per TAG, not per instance:
// `customElements.define` upgrades every instance of a tag at once, so every one of them
// needs its subtree alive and its state handed over before any receives a gesture.

import { type PageMaps } from './maps.js';
import { type Cells } from './cells.js';
import { type ChunkLoader } from './chunks.js';
import { type ElementRegistry } from './registry.js';
import { ID_ATTR, idOf, instanceById, instancesOf, type InstanceState } from './instances.js';
import { stopwatch, type ReportHydrated } from './report.js';

interface HydratableHost extends Element {
  h(props: readonly unknown[]): void;
}

export interface CascadeConfig {
  readonly maps: PageMaps;
  readonly cells: Cells;
  readonly loader: ChunkLoader;
  readonly registry: ElementRegistry;
  readonly state: InstanceState;
  readonly root: ParentNode;
  readonly report: ReportHydrated;
}

export interface Cascade {
  /**
   * Brings up every instance of `tag`: its subtree, then its definition, the owners of its
   * empty cells and its state. Resolves with the time its own definition took.
   */
  raise(tag: string): Promise<string>;
  /** Brings up the subtree of every instance of `tag`, leaving those instances untouched. */
  prepareTag(tag: string): Promise<void>;
  /** Brings up what the route hands values to, leaving the route untouched. */
  prepareRoute(name: string, host: Element): Promise<void>;
  /** Hands every instance of `tag` its state, once. */
  attachAll(tag: string): void;
}

export function createCascade(config: CascadeConfig): Cascade {
  const { maps, cells, loader, registry, state, root, report } = config;

  const attachAll = (tag: string): void => {
    for (const host of instancesOf(tag, root)) {
      const id = idOf(host);
      if (state.attached.has(id)) continue;
      state.attached.add(id);
      registry.upgrade(host);
      (host as HydratableHost).h(cells.resolve(id));
    }
  };

  // Owners already being raised. Raising an owner walks its subtree, which contains the
  // instance that asked for it: without this the walk would ask for the owner again, forever.
  const raising = new Set<number>();

  // An owner is an ancestor, so it comes up with its whole subtree: a host never comes up
  // over children that are not defined yet.
  const raiseOwner = async (id: number): Promise<void> => {
    if (state.hydrated.has(id) || raising.has(id)) return;
    const host = instanceById(id, root);
    // A marker pointing at an instance that is not in the page: the cell keeps its value.
    if (host === undefined) return;
    raising.add(id);
    try {
      const tag = host.localName;
      const ms = await raise(tag);
      // Its own owner may have come up in between and brought it up with its subtree.
      if (state.hydrated.has(id)) return;
      state.hydrated.add(id);
      report(id, tag, ms, 'subtree');
    } finally {
      raising.delete(id);
    }
  };

  // An empty cell holds a function its owner has to provide, so the owner comes up first.
  const prepareCells = async (tag: string): Promise<void> => {
    for (const host of instancesOf(tag, root)) {
      if (state.attached.has(idOf(host))) continue;
      for (const [owner] of cells.eager(idOf(host))) {
        await raiseOwner(owner);
      }
    }
  };

  const define = async (tag: string): Promise<string> => {
    const elapsed = stopwatch();
    await loader.ensureDefined(tag);
    await prepareCells(tag);
    attachAll(tag);
    return elapsed();
  };

  // `key` names the host's entry in the tree map: its tag, or the route's name for a route.
  const visit = async (host: Element, depth: number, key = host.localName): Promise<void> => {
    // A route's root is the `<body>`, which has no shadow root and holds its children directly.
    const scope = host.shadowRoot ?? host;
    for (const childTag of maps.tree[key] ?? []) {
      for (const kid of scope.querySelectorAll(`${childTag}[${ID_ATTR}]`)) {
        await visit(kid, depth + 1);
      }
    }
    // The root of the walk is left to whoever asked for it.
    if (depth === 0) return;
    const id = idOf(host);
    if (state.hydrated.has(id)) return;
    const tag = host.localName;
    const ms = await define(tag);
    state.hydrated.add(id);
    report(id, tag, ms, 'subtree');
  };

  const prepareTag = async (tag: string): Promise<void> => {
    for (const host of instancesOf(tag, root)) {
      await visit(host, 0);
    }
  };

  const raise = async (tag: string): Promise<string> => {
    await prepareTag(tag);
    return define(tag);
  };

  const prepareRoute = async (name: string, host: Element): Promise<void> => {
    await visit(host, 0, name);
  };

  return { raise, prepareTag, prepareRoute, attachAll };
}
