/**
 * Pruning the `page` pass (SDD-27 §5.1): its chunks leave the bundle, its assets stay.
 *
 * The `page` pass emits one chunk per route into the main build. Nothing loads them — the
 * Service Worker links the CJS chunks of `sw/c`, and the edge runs the ESM ones outside
 * `dist` — but the pass CANNOT be removed, because it is what pulls each route and its
 * components into the client graph, and therefore the only pass that makes Vite emit the
 * linked asset FILES. `sw/c` references `logo-<hash>.png`; `page` produces it.
 *
 * So the rule is a reachability one, not a name one: keep what a ROOT can reach. A root is
 * a chunk something actually loads — the main-thread bootstrap and the hydration chunks.
 * Everything a root imports comes along, which is what saves the shared `element-*` chunk
 * without naming it.
 *
 * The one subtlety is source maps: a `.map` is an ASSET, so a blanket "keep every asset"
 * leaves the maps of the very chunks that were just dropped. They go with their chunk.
 */

/** A bundle entry, structurally — the exact type moves between Rollup and Rolldown. */
export interface PruneItem {
  readonly type: string;
  readonly fileName: string;
  readonly imports?: readonly string[];
}

/**
 * The file names to keep. Everything else in the bundle can be deleted.
 *
 * `isRoot` is asked only about chunks: assets have no reachability of their own, they are
 * either the companion of a chunk or a file the linker emitted, and both are decided here.
 */
export function keepSet(
  items: readonly PruneItem[],
  isRoot: (item: PruneItem) => boolean,
): ReadonlySet<string> {
  const byName = new Map<string, PruneItem>();
  for (const item of items) {
    byName.set(item.fileName, item);
  }

  const reachable = new Set<string>();
  const visit = (fileName: string): void => {
    if (reachable.has(fileName)) {
      return;
    }
    reachable.add(fileName);
    // An import that names nothing in this bundle is external (`@fudic/ssr` in the link
    // pass, a bare specifier the host externalized). There is nothing to walk into.
    const item = byName.get(fileName);
    if (item === undefined) {
      return;
    }
    for (const imported of item.imports ?? []) {
      visit(imported);
    }
  };

  const dropped = new Set<string>();
  for (const item of items) {
    if (item.type !== 'chunk') {
      continue;
    }
    if (isRoot(item)) {
      visit(item.fileName);
      continue;
    }
    dropped.add(item.fileName);
  }
  // A chunk reached from a root is kept even if it was first seen as a non-root: the
  // shared `element-*` is exactly that, and so is any chunk two roots have in common.
  for (const fileName of reachable) {
    dropped.delete(fileName);
  }

  const keep = new Set<string>(reachable);
  for (const item of items) {
    if (item.type === 'chunk') {
      continue;
    }
    // A map belongs to its chunk. Keeping it after dropping the chunk publishes the
    // sources of code that is not there — bigger AND wrong.
    if (item.fileName.endsWith('.map') && dropped.has(item.fileName.slice(0, -'.map'.length))) {
      continue;
    }
    keep.add(item.fileName);
  }
  return keep;
}
