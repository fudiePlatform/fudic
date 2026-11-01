import { type ElementRegistry } from './registry.js';

/** The URL of a tag's hydration chunk. */
export type ResolveChunk = (tag: string) => string;

/** How a chunk is fetched and evaluated. */
export type ImportModule = (url: string) => Promise<unknown>;

export const importChunk: ImportModule = (url) => import(/* @vite-ignore */ url);

/** The default export of a route's chunk. `fields` are the settled `later` fields of its parts. */
export type RouteFactory = (
  props: readonly unknown[],
  fields?: Readonly<Record<string, unknown>>,
) => RouteController;

export interface RouteController {
  /** Adopts the server-rendered page. */
  h(): void;
  /** Re-applies values. */
  u(): void;
  /** Releases it. */
  r(): void;
}

export interface ChunkLoader {
  /** Defines `tag`, downloading its chunk once per tag. */
  ensureDefined(tag: string): Promise<void>;
  /** The factory of a route's chunk, or `null` when the module has no default export. */
  loadRoute(name: string): Promise<RouteFactory | null>;
}

export interface ChunkLoaderConfig {
  readonly resolveChunk: ResolveChunk;
  readonly registry: ElementRegistry;
  readonly importModule: ImportModule;
}

export function createChunkLoader(config: ChunkLoaderConfig): ChunkLoader {
  const { resolveChunk, registry, importModule } = config;
  const inflight = new Map<string, Promise<unknown>>();

  // One download per name while it is in flight or done. A failure is forgotten, so the next
  // gesture asks again instead of leaving the component dead until a reload.
  const once = (name: string, load: () => Promise<unknown>): Promise<unknown> => {
    let pending = inflight.get(name);
    if (pending === undefined) {
      pending = load();
      inflight.set(name, pending);
      pending.catch(() => {
        inflight.delete(name);
      });
    }
    return pending;
  };

  return {
    async ensureDefined(tag: string): Promise<void> {
      if (registry.get(tag) !== undefined) return;
      // The chunk defines the tag as a side effect of being evaluated.
      await once(tag, () => importModule(resolveChunk(tag)).then(() => registry.whenDefined(tag)));
    },

    async loadRoute(name: string): Promise<RouteFactory | null> {
      const module = (await once(name, () => importModule(resolveChunk(name)))) as {
        default?: RouteFactory;
      } | null;
      return typeof module?.default === 'function' ? module.default : null;
    },
  };
}
