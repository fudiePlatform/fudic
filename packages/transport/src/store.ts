/**
 * Cache access with policy and in-flight deduplication (SDD-20 §4.6.3, §4.7).
 *
 * Two rules from real regressions:
 *  - Two concurrent calls for the same URL share ONE network request; each caller
 *    gets its own `clone()` of the body. Without this the prototype downloaded every
 *    chunk twice.
 *  - The Cache API stores no timestamps, so a stored response is SEALED with
 *    `x-fudic-stored`; that stamp is the whole TTL mechanism. Only DATA ages —
 *    chunks and pages are immutable within a build (that is what the build id in the
 *    cache name is for).
 */

import { type CachePolicy } from './manifest.js';

/** The four caches of the framework, namespaced by build id (§4.10). */
export interface CacheNames {
  readonly shell: string;
  readonly routes: string;
  readonly pages: string;
  readonly data: string;
}

export function cacheNames(build: string): CacheNames {
  return {
    shell: `shell-${build}`,
    routes: `routes-${build}`,
    pages: `pages-${build}`,
    data: `data-${build}`,
  };
}

/** True for a cache name of a build that is NOT the current one (purged on activate). */
export function isStaleCache(name: string, build: string): boolean {
  return /^(shell|routes|pages|data)-/u.test(name) && !name.endsWith(`-${build}`);
}

export const STAMP_HEADER = 'x-fudic-stored';

export interface StoreConfig {
  readonly cache: Cache;
  /** Injected clock, so TTL tests are deterministic. */
  readonly now?: () => number;
  /** Injected network, so the store is testable without a platform `fetch`. */
  readonly net?: (request: Request) => Promise<Response>;
}

export interface Store {
  /** Apply the policy; deduplicate in-flight requests by URL. */
  get(request: Request, policy: CachePolicy, ttl: number | null): Promise<Response>;
  put(request: Request, response: Response): Promise<void>;
  match(request: Request): Promise<Response | undefined>;
  delete(request: Request): Promise<boolean>;
  /** FIFO by the insertion order `cache.keys()` returns (LRU is out of v1). */
  prune(maxEntries: number): Promise<void>;
  keys(): Promise<readonly string[]>;
}

/** Copy a response adding the storage stamp; the original stays readable. */
function seal(response: Response, at: number): Response {
  const headers = new Headers(response.headers);
  headers.set(STAMP_HEADER, String(at));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** A cached response is fresh when it has no TTL, or its stamp is within it. */
function isFresh(response: Response, ttl: number | null, now: number): boolean {
  if (ttl === null) {
    return true;
  }
  const stamp = Number(response.headers.get(STAMP_HEADER) ?? '0');
  return now - stamp < ttl;
}

export function createStore(config: StoreConfig): Store {
  const now = config.now ?? ((): number => Date.now());
  const net = config.net ?? ((request: Request): Promise<Response> => fetch(request));
  const inFlight = new Map<string, Promise<Response>>();

  const put = async (request: Request, response: Response): Promise<void> => {
    await config.cache.put(request, seal(response, now()));
  };

  /** One network request per URL at a time; every caller gets its own clone. */
  const fromNetwork = async (request: Request): Promise<Response> => {
    const key = request.url;
    let pending = inFlight.get(key);
    if (pending === undefined) {
      pending = net(request).finally(() => {
        inFlight.delete(key);
      });
      inFlight.set(key, pending);
    }
    const master = await pending;
    if (master.ok) {
      await put(request, master.clone());
    }
    return master.clone();
  };

  const store: Store = {
    async get(request: Request, policy: CachePolicy, ttl: number | null): Promise<Response> {
      if (policy === 'network-only') {
        return fromNetwork(request);
      }
      const cached = await config.cache.match(request);

      if (policy === 'network-first') {
        try {
          return await fromNetwork(request);
        } catch (error) {
          if (cached !== undefined) {
            return cached;
          }
          throw error;
        }
      }

      if (policy === 'stale-while-revalidate') {
        if (cached !== undefined) {
          // Serve the stale copy and refresh behind it. A page CAN render with old
          // data — but only because its route asked for it.
          if (!isFresh(cached, ttl, now())) {
            void fromNetwork(request).catch(() => undefined);
          }
          return cached;
        }
        return fromNetwork(request);
      }

      // cache-first
      if (cached !== undefined && isFresh(cached, ttl, now())) {
        return cached;
      }
      try {
        return await fromNetwork(request);
      } catch (error) {
        if (cached !== undefined) {
          return cached; // expired beats nothing
        }
        throw error;
      }
    },

    put,

    match(request: Request): Promise<Response | undefined> {
      return config.cache.match(request);
    },

    delete(request: Request): Promise<boolean> {
      return config.cache.delete(request);
    },

    async prune(maxEntries: number): Promise<void> {
      const keys = await config.cache.keys();
      const excess = keys.length - maxEntries;
      for (let i = 0; i < excess; i += 1) {
        const request = keys[i];
        if (request !== undefined) {
          await config.cache.delete(request);
        }
      }
    },

    async keys(): Promise<readonly string[]> {
      return (await config.cache.keys()).map((r) => r.url);
    },
  };

  return store;
}
