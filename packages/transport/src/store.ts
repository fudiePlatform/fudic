/**
 * Cache access with policy and in-flight deduplication (SDD-20 §4.6.3, §4.7).
 *
 * **THE KEY OF A STORE IS THE URL, AND NOTHING ELSE** (BUG-04). The Cache API is not a
 * `Map` keyed by URL — it is an HTTP cache whose key is the whole request, filtered by
 * the `Vary` of the STORED RESPONSE. So an entry written by one kind of request could not
 * be found by another: `install` precached `/fudic-main.js` with no `Origin` header, the
 * page asked for it as a module (CORS mode, `Origin` present), the host had answered
 * `Vary: Origin`, and a `cache-first` silently behaved like `network-first`.
 *
 * Hence the split that shapes this module:
 *  - the CACHE leg is addressed by URL — query included, headers excluded;
 *  - the NETWORK leg gets the original `Request`, verbatim, so CORS, credentials and
 *    `Accept` behave.
 *
 * `put`/`match`/`delete` therefore take a URL `string`: a caller cannot invent a key, so
 * the class of defect is gone from the space of writable programs rather than from the
 * program written.
 *
 * Three more rules, each from a real regression:
 *  - Two concurrent calls for the same URL share ONE network request; each caller
 *    gets its own `clone()` of the body. Without this the prototype downloaded every
 *    chunk twice. It indexes by the SAME expression as the cache key, so the two
 *    indexings cannot disagree.
 *  - The Cache API stores no timestamps, so a stored response is SEALED with
 *    `x-fudic-stored`; that stamp is the whole TTL mechanism. Only DATA ages —
 *    chunks and pages are immutable within a build (that is what the build id in the
 *    cache name is for).
 *  - Caching is best-effort; serving is not. Nothing on the storage path can turn a good
 *    response into a network error.
 */

import { type CachePolicy } from './manifest.js';

/** The four caches of the framework, namespaced by APP and then by build (BUG-33 §4.1). */
export interface CacheNames {
  readonly shell: string;
  readonly routes: string;
  readonly pages: string;
  readonly data: string;
}

/** The four kinds, and the whole of the scheme's vocabulary. */
const KINDS = ['shell', 'routes', 'pages', 'data'] as const;

/**
 * How long a build id measures. It belongs to THIS scheme — it is what has to be left
 * after `<kind>-<app>-` for a name to be this app's — so it lives next to the scheme and
 * the emitter's substitution token is checked against it.
 */
export const BUILD_ID_LENGTH = 8;

/**
 * `<kind>-<app>-<build>`, and the app goes in the MIDDLE.
 *
 * What is read by prefix is *whose cache is this*, and what is compared by equality is the
 * build. Putting the app last would invert both.
 */
export function cacheNames(app: string, build: string): CacheNames {
  return {
    shell: `shell-${app}-${build}`,
    routes: `routes-${app}-${build}`,
    pages: `pages-${app}-${build}`,
    data: `data-${app}-${build}`,
  };
}

/**
 * True for a cache of THIS app and a build that is not the current one.
 *
 * A cache of another app is never stale here: purging it is the defect this fixes. The cut
 * is by WIDTH and never by the last hyphen, because an app id may contain hyphens — with a
 * bare prefix, `shop` would claim `shell-shop-admin-…` and purge the caches of
 * `shop-admin`, which is the same defect one size smaller. It is the argument of the
 * chunk renamer, applied to the other end of the same naming scheme.
 *
 * Also true for a name written BEFORE this fix, `<kind>-<build>` with no app segment: with
 * the new rule it matches nobody's prefix and would sit in the origin forever. It is
 * unambiguous — only a worker older than this fix could have written it — and transitory.
 */
export function isStaleCache(name: string, app: string, build: string): boolean {
  for (const kind of KINDS) {
    const mine = `${kind}-${app}-`;
    if (name.startsWith(mine)) {
      const rest = name.slice(mine.length);
      // Another app whose id merely starts like ours: not ours, and not ours to delete.
      if (rest.length !== BUILD_ID_LENGTH) continue;
      return rest !== build;
    }
    // The pre-BUG-33 shape. Not even our own build saves it: it cannot be attributed.
    if (name.startsWith(`${kind}-`) && name.length === kind.length + 1 + BUILD_ID_LENGTH) {
      return true;
    }
  }
  return false;
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
  /**
   * Apply the policy; deduplicate in-flight requests by URL.
   *
   * The cache key is the URL. A `Request` is used VERBATIM for the network leg — pass
   * the one the `FetchEvent` gave you — while a `string` is enough when there is no
   * originating request (a precache, a warm). Absolute URLs: the router's `abs()` is
   * there for that.
   */
  get(target: Request | string, policy: CachePolicy, ttl: number | null): Promise<Response>;
  /** URL, not `Request`: the key of this store is the URL and nothing else. */
  put(url: string, response: Response): Promise<void>;
  match(url: string): Promise<Response | undefined>;
  delete(url: string): Promise<boolean>;
  /** FIFO by the insertion order `cache.keys()` returns (LRU is out of v1). */
  prune(maxEntries: number): Promise<void>;
  keys(): Promise<readonly string[]>;
}

/** The cache key of anything addressable: the URL, query included, and nothing else. */
function keyOf(target: Request | string): string {
  return typeof target === 'string' ? target : target.url;
}

/**
 * Every read and every delete ignores `Vary`.
 *
 * This framework does not negotiate content, and it is not going to negotiate halfway: if
 * a response depends on a request header, that axis belongs in the URL (BUG-04 §4.3). A
 * list of "safe `Vary` values" would be the worst of both worlds — the same argument as
 * against putting a TTL on something the cache name already versions.
 *
 * `ignoreSearch` and `ignoreMethod` stay FALSE on purpose: `/api/items?page=2` is another
 * resource, and a `Store` is GET-only, like the Cache API itself.
 */
const QUERY: CacheQueryOptions = { ignoreVary: true };

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

  const put = async (url: string, response: Response): Promise<void> => {
    await config.cache.put(url, seal(response, now()));
  };

  /** One network request per URL at a time; every caller gets its own clone. */
  const fromNetwork = async (target: Request | string, key: string): Promise<Response> => {
    let pending = inFlight.get(key);
    if (pending === undefined) {
      pending = net(typeof target === 'string' ? new Request(target) : target).finally(() => {
        inFlight.delete(key);
      });
      inFlight.set(key, pending);
    }
    const master = await pending;
    // Caching is best-effort; serving is not. `status === 200` and not `ok`, because
    // `cache.put` THROWS on a 206 and a `<video>` with a `Range` is enough to hit it; and
    // the `catch` so that an exhausted quota cannot turn a good response into a network
    // error (BUG-04 §4.4).
    if (master.status === 200) {
      await put(key, master.clone()).catch(() => undefined);
    }
    return master.clone();
  };

  const store: Store = {
    async get(target: Request | string, policy: CachePolicy, ttl: number | null): Promise<Response> {
      const key = keyOf(target);
      if (policy === 'network-only') {
        return fromNetwork(target, key);
      }
      const cached = await config.cache.match(key, QUERY);

      if (policy === 'network-first') {
        try {
          return await fromNetwork(target, key);
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
            void fromNetwork(target, key).catch(() => undefined);
          }
          return cached;
        }
        return fromNetwork(target, key);
      }

      // cache-first
      if (cached !== undefined && isFresh(cached, ttl, now())) {
        return cached;
      }
      try {
        return await fromNetwork(target, key);
      } catch (error) {
        if (cached !== undefined) {
          return cached; // expired beats nothing
        }
        throw error;
      }
    },

    put,

    match(url: string): Promise<Response | undefined> {
      return config.cache.match(url, QUERY);
    },

    delete(url: string): Promise<boolean> {
      return config.cache.delete(url, QUERY);
    },

    async prune(maxEntries: number): Promise<void> {
      // Sliced rather than indexed: an index access under `noUncheckedIndexedAccess`
      // forces a guard for a case `keys()` cannot produce, and an unreachable guard is
      // a branch no test can cover.
      const keys = await config.cache.keys();
      for (const request of keys.slice(0, Math.max(0, keys.length - maxEntries))) {
        await config.cache.delete(request);
      }
    },

    async keys(): Promise<readonly string[]> {
      return (await config.cache.keys()).map((r) => r.url);
    },
  };

  return store;
}
