/**
 * Downloading a component's chunk — BY TAG, memoized (SDD-17 §4.1, §4.6).
 *
 * The two axes are independent and confusing them was the defect the first prototype's
 * validation found: hydration is controlled per INSTANCE (`data-fud-id`), the download per
 * TAG. Two instances of the same tag share one download and still hydrate each on its own
 * first interaction.
 *
 * **There is no `tag → URL` map**, and its absence is the design (SDD-17 §4.6). The URL is
 * DERIVED — `createUrlResolver(base, build).hydrateUrl(tag)` — and derivation is what the
 * `resolveChunk` port carries in. A map would put the same fact in two files published by
 * different paths and expiring by different rules: the manifest is purged per build, a JSON
 * embedded in a prerendered HTML lives as long as that HTML is cached, so a deploy would
 * leave a page pointing at the previous build's chunks.
 *
 * The port also keeps the package boundary intact: `@fudic/core` does not import
 * `@fudic/transport`, and the caller that knows whether the page was emitted for a dev
 * server or for a build is the bootstrap, not this module.
 */

import { type ElementRegistry } from './registry.js';

/** The port of §4.6: the URL of a tag's hydration chunk. */
export type ResolveChunk = (tag: string) => string;

/** How a chunk is fetched and evaluated. Injected so the loader is testable off-network. */
export type ImportModule = (url: string) => Promise<unknown>;

/**
 * The default: a bare dynamic `import()`. The runtime is agnostic to where the bytes come
 * from — a Service Worker may serve them from cache, the network may serve them cold — and
 * `@vite-ignore` says exactly that: the specifier is a runtime value, not a build-time edge.
 */
export const importChunk: ImportModule = (url) => import(/* @vite-ignore */ url);

export interface ChunkLoader {
  /** Define `tag`, downloading its chunk at most once per tag for the life of the page. */
  ensureDefined(tag: string): Promise<void>;
}

export interface ChunkLoaderConfig {
  readonly resolveChunk: ResolveChunk;
  readonly registry: ElementRegistry;
  readonly importModule: ImportModule;
}

export function createChunkLoader(config: ChunkLoaderConfig): ChunkLoader {
  const { resolveChunk, registry, importModule } = config;
  /** tag → the promise of its definition. THE memoization of §4.6: one chunk per tag. */
  const inflight = new Map<string, Promise<unknown>>();

  return {
    async ensureDefined(tag: string): Promise<void> {
      if (registry.get(tag) !== undefined) {
        return;
      }
      let pending = inflight.get(tag);
      if (pending === undefined) {
        // `whenDefined` and not just the import: the chunk's `customElements.define` is a
        // side effect of evaluating it, and awaiting the registry is what makes "defined"
        // the thing this function promises.
        pending = importModule(resolveChunk(tag)).then(() => registry.whenDefined(tag));
        inflight.set(tag, pending);
      }
      await pending;
    },
  };
}
