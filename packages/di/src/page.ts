import { createChild, createRoot } from './container.js';
import type { Container } from './types.js';

/** One owning node of the emitted map: its parent, or `-1` for the root. */
export type IocNodes = readonly number[];

/**
 * Build the container tree of a route from the EMITTED map, in memory.
 *
 * `nodes[i]` is the parent index of node `i`; node 0 is the root. `register` is the
 * route's IoC module: it puts each node's factories into the container it owns them in.
 *
 * Nothing here reads the DOM, and that is the whole point. An owning ancestor may well be
 * N1 — it declares providers, injects nothing, hydrates never and runs not a single line
 * in the browser — so a hierarchy that had to be climbed would find its element and find
 * no container. And the hydration cascade goes by tag and in post-order, so at the moment
 * a component wakes up there is no parent to ask.
 */
export function buildTree(
  nodes: IocNodes,
  register: (node: number, container: Container) => void,
  seed?: Readonly<Record<string, unknown>>,
): readonly Container[] {
  const containers: Container[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const parent = nodes[i] as number;
    // Node 0 is the root and its parent is -1; every other node is emitted after the one
    // it hangs from, so the parent is always already built.
    containers.push(
      parent < 0 ? createRoot(seed) : createChild(containers[parent] as Container, `ioc#${i}`),
    );
    register(i, containers[i] as Container);
  }
  tree = containers;
  return containers;
}

/**
 * The page's tree, so a component chunk can turn the node its payload carried into the
 * container it resolves from.
 *
 * One per document, and it dies with it: the root container IS the route (SDD-38 §4.7).
 * The bootstrap builds it before a single chunk is fetched, which is why a chunk never has
 * to wait for it.
 */
let tree: readonly Container[] | null = null;

/**
 * The container a hydrated instance resolves from: the node its slice carried, resolved
 * against the page's tree.
 *
 * No node — an instance the parent fabricated at runtime, which never had a payload — means
 * the root, where the `@Service` classes live. It is the honest answer rather than a
 * fallback: what such an instance can see is exactly what the route registered globally.
 *
 * A page whose route declares no provider publishes no map, so the tree is built here, once,
 * with the root alone.
 */
export function containerOf(node?: number): Container {
  if (tree === null) buildTree([-1], NOTHING);
  const built = tree as readonly Container[];
  return built[node ?? 0] ?? (built[0] as Container);
}

const NOTHING = (): void => {};
