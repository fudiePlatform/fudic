/**
 * Hydration, installed as `fudic:runtime` installs it (§4.5), through the options
 * `installHydration` already has: the document of the environment, a `resolveChunk` that
 * names each tag's `?client` module, and an `importModule` that imports it through vitest's
 * graph. A gesture on a host nobody hydrated yet raises it exactly as the browser does: the
 * first click counts.
 *
 * Every import is tracked, so a gesture can wait for it (§4.7).
 */

import { installHydration, ROUTE_BLOCK, signal, type HydrationOptions } from '@fudic/core';
import { browserDom } from '@fudic/dom';
import { track } from './pending.js';
import { localized } from './project.js';
import { standTree, type ProviderOverride } from './providers.js';

/** The tags of a page and the `?client` module of each. */
export type ChunkMap = ReadonlyMap<string, string>;

/** Import a module by id through vitest's graph, counted as pending. */
const importModule = (id: string): Promise<unknown> => track(import(/* @vite-ignore */ id));

/**
 * The two pieces the load does not pay for in a browser — the DOM adapter and the signal —
 * handed over already in hand: they are this graph's own modules, the ones every chunk
 * imports.
 */
const importDeferred: NonNullable<HydrationOptions['importDeferred']> = () =>
  Promise.resolve({ dom: browserDom, signal });

/**
 * The registry as a freshly loaded page sees it (decision 8.1.12).
 *
 * A `customElements.define` cannot be undone, and a tag an earlier test defined is still
 * defined for the next page. The runtime reads «defined» as «its instances were raised along
 * with it» (path 3) and would not raise them: in a browser a page that has the definition
 * already is a page whose cascade put it there. So each page sees a tag as defined only once
 * its own loader has asked for it.
 */
function pageRegistry(): NonNullable<HydrationOptions['registry']> {
  const loaded = new Set<string>();
  return {
    get: (name) => (loaded.has(name) ? customElements.get(name) : undefined),
    whenDefined: async (name) => {
      await customElements.whenDefined(name);
      loaded.add(name);
    },
    upgrade: (node) => {
      customElements.upgrade(node);
    },
  };
}

/**
 * The modules of a page's components, by the name the runtime asks for: `<tag>` is its
 * `?client` chunk and `<tag>.ioc` its `?ioc` module (SDD-38 §4.5), compiled for `locale` — the
 * project's, unless the page names its own.
 */
export function chunkMap(components: Iterable<{ readonly tag: string; readonly path: string }>, locale?: string): ChunkMap {
  const map = new Map<string, string>();
  for (const { tag, path } of components) {
    map.set(tag, localized(`${path}?client`, locale));
    map.set(`${tag}.ioc`, localized(`${path}?ioc`, locale));
  }
  return map;
}

/**
 * `chunks` plus the page's own route, when the page publishes one: the name it writes in
 * `fud-route` is the name the runtime asks for, and its module is the `?client` of `file`, the
 * route itself. A page with no client half of its own publishes no name, and adds nothing.
 */
export function withRoute(chunks: ChunkMap, doc: Document, file: string, locale?: string): ChunkMap {
  const block = doc.getElementById(ROUTE_BLOCK);
  if (block === null) return chunks;
  const name = JSON.parse(String(block.textContent)) as string;
  return new Map([...chunks, [name, localized(`${file}?client`, locale)]]);
}

/**
 * How the runtime finds a module by the name it asks for. It asks only for tags that carry a
 * `data-fud-id` and for the owners `fud-ioc` names, and the page printed those out of the very
 * graph the map was read from: the lookup cannot miss.
 */
export function resolverOf(chunks: ChunkMap): (name: string) => string {
  return (name) => chunks.get(name)!;
}

/**
 * Install hydration with its capture listener on `root`, with the page's container tree
 * standing — overrides included — before the first chunk is raised, as the coordinator does.
 */
export function hydrate(root: HTMLElement, chunks: ChunkMap, providers: readonly ProviderOverride[]): void {
  const resolveChunk = resolverOf(chunks);
  installHydration({
    root,
    document,
    resolveChunk,
    importModule,
    importDeferred,
    registry: pageRegistry(),
    ready: track(standTree(resolveChunk, providers)),
  });
}
