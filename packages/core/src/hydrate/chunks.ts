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

/**
 * What a ROUTE's chunk exports (SDD-39 §3.4): a factory, not a custom element.
 *
 * A route is not defined, not instantiated and never fabricated hot, so there is nothing for
 * `customElements` to hold. What the runtime holds is the function and the three entry points
 * it hands back — and `c` is not among them, because a route always comes from the server.
 */
export type RouteFactory = (props: readonly unknown[]) => RouteController;

export interface RouteController {
  /** Adopt the composed page and hook up. The counterpart of a component's `h`. */
  h(): void;
  /** The value channel, for whoever holds a cell of this route. */
  u(): void;
  /** Release. The hook SDD-20 will need the day a navigation stops reloading. */
  r(): void;
}

export interface ChunkLoader {
  /** Define `tag`, downloading its chunk at most once per tag for the life of the page. */
  ensureDefined(tag: string): Promise<void>;
  /**
   * The factory of a ROUTE's chunk, by name — memoized on the same map and by the same rule.
   *
   * `null` when the module carries no default export, which is what a stale or wrong URL
   * looks like from here. The runtime does not throw over it: the page stays as the server
   * painted it, which is the whole point of a page that works before its JavaScript does.
   */
  loadRoute(name: string): Promise<RouteFactory | null>;
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

    async loadRoute(name: string): Promise<RouteFactory | null> {
      // The same map and the same memoization a tag gets: one download per name for the life
      // of the page. What differs is what the module is asked for — a default export instead
      // of a definition — because a route has no tag for the registry to hold.
      let pending = inflight.get(name);
      if (pending === undefined) {
        pending = importModule(resolveChunk(name));
        inflight.set(name, pending);
      }
      const module = (await pending) as { default?: RouteFactory } | null;
      return typeof module?.default === 'function' ? module.default : null;
    },
  };
}
