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

/** What the page printed: the parent of each owning node, and the tag that owns it. */
export type IocMap = readonly [nodes: IocNodes, tags: readonly string[]];

/** What starting the injection of a route takes (SDD-45 §3.4). */
export interface PageTreeOptions {
  /** The map, already parsed: where a document keeps its blocks is the document's business. */
  readonly map: IocMap;
  /** The URL of a chunk, derived the one way this application derives them. */
  readonly resolveChunk: (tag: string) => string;
  /** What the server published for the root container, when the route published anything. */
  readonly seed?: Readonly<Record<string, unknown>>;
}

/** What an owner's IoC module exports (SDD-38 §4.5). */
interface IocModule {
  readonly register: (container: Container) => void;
}

/**
 * Fetch each owner's IoC module and build the route's tree — the whole of what a route's
 * injection does before a single component wakes up.
 *
 * **It is here and not in the generated coordinator**, and that is SDD-45 §1.5 rule 3 rather
 * than tidiness: what a coordinator may contain is the folder and the build id of its
 * application, and this loop is neither — it is identical for every app that injects.
 * Measured, it was also most of the coordinator's weight: written there, a dynamic `import()`
 * drags the application bundler's preload helper with it, eleven hundred bytes of scaffolding
 * that this package's own build does not emit, and that put the coordinator over the kilobyte
 * of SDD-45 criterion 15.
 *
 * Nothing here reads the DOM either. The map arrives parsed, and this package still has no
 * opinion about where a page keeps it.
 */
export async function installPage({
  map: [nodes, tags],
  resolveChunk,
  seed,
}: PageTreeOptions): Promise<readonly Container[]> {
  // One module per OWNING tag, by URL — the same arithmetic a hydration chunk uses, so there
  // is no second resolver and nothing new in the manifest. Deduped: a tag that owns three
  // nodes is still one module.
  const owners = [...new Set(tags.filter((tag) => tag !== ''))];
  const loaded = (await Promise.all(
    owners.map((tag) => import(resolveChunk(`${tag}.ioc`))),
  )) as readonly IocModule[];
  const byTag = new Map(owners.map((tag, i) => [tag, loaded[i] as IocModule]));
  return buildTree(
    nodes,
    (node, container) => {
      byTag.get(tags[node] ?? '')?.register(container);
    },
    seed,
  );
}
