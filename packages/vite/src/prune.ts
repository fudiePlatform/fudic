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
 * The CHUNKS a root can reach, roots included, in bundle order.
 *
 * This is what completes the Service Worker's shell (SDD-17 §4.7.1). The moment
 * `fudic-main` installs the hydration runtime it stops being self-contained: it shares
 * `@fudic/core` with the 1..N hydration chunks, and Rollup extracts that shared code into a
 * chunk with a HASH in its name. `sw.json` lists literal URLs, and a hashed name cannot be
 * written by hand — so the chunk every page needs would sit outside the precache and be paid
 * for over the network on every cold navigation. In `generateBundle` the graph is already in
 * hand, so it is computed rather than declared.
 *
 * Chunks only: an asset is not something a page loads to boot, and the shell is exact URLs.
 */
export function reachableChunks(
  items: readonly PruneItem[],
  isRoot: (item: PruneItem) => boolean,
): readonly string[] {
  const chunks = new Map<string, PruneItem>();
  for (const item of items) {
    if (item.type === 'chunk') {
      chunks.set(item.fileName, item);
    }
  }
  const found: string[] = [];
  const seen = new Set<string>();
  const visit = (fileName: string): void => {
    const item = chunks.get(fileName);
    // An import naming nothing in this bundle is external: there is no file to precache.
    if (item === undefined || seen.has(fileName)) {
      return;
    }
    seen.add(fileName);
    found.push(fileName);
    for (const imported of item.imports ?? []) {
      visit(imported);
    }
  };
  for (const item of chunks.values()) {
    if (isRoot(item)) {
      visit(item.fileName);
    }
  }
  return found;
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
