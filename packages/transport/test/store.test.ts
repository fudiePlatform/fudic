/**
 * SDD-20 §6.10–§6.12: policy, TTL by stamp, in-flight dedup and FIFO pruning.
 * BUG-04 §6.1–§6.8: and the one thing none of those could see — that the key of a
 * `Store` is the URL, whoever wrote the entry and whatever `Vary` the server sent.
 */

import { describe, expect, it, vi } from 'vitest';
import { cacheNames, createStore, isStaleCache, STAMP_HEADER, type Store } from '../src/store.js';
import { fakeCache, varyingCache, VaryingCache } from './helpers.js';

const MINUTE = 60_000;
const URL_MAIN = 'https://app.test/fudic-main.js';

/**
 * The two requests of BUG-04 §2.1 over one URL: what `install` fetches (same-origin GET,
 * no `Origin`) and what a `<script type="module">` sends (CORS mode, `Origin` present).
 */
const precacheRequest = (): Request => new Request(URL_MAIN);
const moduleRequest = (): Request =>
  new Request(URL_MAIN, { headers: { origin: 'https://app.test', accept: '*/*' } });

/** A response the way a real host answers a CORS-negotiated static file. */
const varying = (body: string, vary = 'Origin'): Response =>
  new Response(body, { headers: { vary, 'content-type': 'text/javascript' } });

/** A store over a cache that honours `Vary`, with a counting network. */
function varyingStore(response: () => Response): {
  readonly store: Store;
  readonly fake: VaryingCache;
  readonly calls: string[];
} {
  const { cache, fake } = varyingCache();
  const calls: string[] = [];
  const store = createStore({
    cache,
    now: () => 1_000_000,
    net: async (request) => {
      calls.push(request.url);
      return response();
    },
  });
  return { store, fake, calls };
}

/** A store over a fake cache with a controllable clock and a counting network. */
function makeStore(body: () => Response) {
  const { cache, fake } = fakeCache();
  const clock = { t: 1_000_000 };
  const calls: string[] = [];
  const store = createStore({
    cache,
    now: () => clock.t,
    net: async (request) => {
      calls.push(request.url);
      return body();
    },
  });
  return { store, fake, clock, calls };
}

describe('cacheNames', () => {
  it('namespaces the four caches by build id', () => {
    expect(cacheNames('a3f9c1')).toEqual({
      shell: 'shell-a3f9c1',
      routes: 'routes-a3f9c1',
      pages: 'pages-a3f9c1',
      data: 'data-a3f9c1',
    });
  });

  it('recognises caches of another build (purged on activate)', () => {
    expect(isStaleCache('routes-old', 'new')).toBe(true);
    expect(isStaleCache('routes-new', 'new')).toBe(false);
    expect(isStaleCache('some-other-cache', 'new')).toBe(false);
  });
});

describe('Store.get', () => {
  it('§6.10 two concurrent gets share one network request, with independent bodies', async () => {
    const { store, calls } = makeStore(() => new Response('payload'));
    const request = new Request('https://app.test/x.json');
    const [a, b] = await Promise.all([
      store.get(request, 'cache-first', null),
      store.get(request, 'cache-first', null),
    ]);
    expect(calls).toHaveLength(1);
    expect(await a.text()).toBe('payload');
    expect(await b.text()).toBe('payload');
  });

  it('§6.11 cache-first honours the TTL through the stored stamp', async () => {
    const { store, clock, calls } = makeStore(() => new Response('v1'));
    const request = new Request('https://app.test/data.json');
    await store.get(request, 'cache-first', 5 * MINUTE);
    clock.t += 4 * MINUTE;
    await store.get(request, 'cache-first', 5 * MINUTE);
    expect(calls).toHaveLength(1); // fresh: no network
    clock.t += 2 * MINUTE;
    await store.get(request, 'cache-first', 5 * MINUTE);
    expect(calls).toHaveLength(2); // expired: refetched
  });

  it('§6.11 stale-while-revalidate serves the stale copy AND refreshes behind it', async () => {
    const { store, clock, calls } = makeStore(() => new Response('v'));
    const request = new Request('https://app.test/swr.json');
    await store.get(request, 'stale-while-revalidate', MINUTE);
    clock.t += 2 * MINUTE;
    const stale = await store.get(request, 'stale-while-revalidate', MINUTE);
    expect(await stale.text()).toBe('v');
    await Promise.resolve();
    expect(calls).toHaveLength(2); // the background revalidation went out
  });

  it('network-only never reads the cache; network-first falls back to it', async () => {
    let fail = false;
    const { store, calls } = makeStore(() => {
      if (fail) throw new Error('offline');
      return new Response('live');
    });
    const request = new Request('https://app.test/api');
    expect(await (await store.get(request, 'network-only', null)).text()).toBe('live');
    fail = true;
    expect(await (await store.get(request, 'network-first', null)).text()).toBe('live');
    expect(calls).toHaveLength(2); // network-only, then the failed network-first
  });

  it('cache-first serves an expired copy rather than nothing when the network fails', async () => {
    let fail = false;
    const { store, clock } = makeStore(() => {
      if (fail) throw new Error('offline');
      return new Response('cached');
    });
    const request = new Request('https://app.test/d.json');
    await store.get(request, 'cache-first', MINUTE);
    clock.t += 2 * MINUTE;
    fail = true;
    expect(await (await store.get(request, 'cache-first', MINUTE)).text()).toBe('cached');
  });

  it('propagates a network failure when there is nothing cached', async () => {
    const { store } = makeStore(() => {
      throw new Error('offline');
    });
    await expect(store.get(new Request('https://app.test/none'), 'cache-first', null)).rejects.toThrow(
      /offline/u,
    );
    await expect(
      store.get(new Request('https://app.test/none'), 'network-first', null),
    ).rejects.toThrow(/offline/u);
  });

  it('does not cache a failed response', async () => {
    const { store, fake } = makeStore(() => new Response('nope', { status: 404 }));
    await store.get(new Request('https://app.test/missing.html'), 'cache-first', null);
    expect(fake.entries.size).toBe(0);
  });

  it('seals every stored response with its timestamp', async () => {
    const { store, fake, clock } = makeStore(() => new Response('x'));
    await store.get(new Request('https://app.test/s'), 'cache-first', null);
    const stored = [...fake.entries.values()][0]!;
    expect(stored.headers.get(STAMP_HEADER)).toBe(String(clock.t));
  });
});

/**
 * BUG-04: the key is the URL. Every test here is run against a cache that honours `Vary`,
 * because that is the only kind of cache in which the defect exists.
 */
describe('Store — the key is the URL (BUG-04)', () => {
  it('§6.1 serves an entry the precache wrote to the request a module makes', async () => {
    const { store, fake, calls } = varyingStore(() => varying('never'));
    // What `install` does: fetch with no `Origin`, store the answer.
    await fake.put(precacheRequest(), varying('main()'));
    const response = await store.get(moduleRequest(), 'cache-first', null);
    expect(await response.text()).toBe('main()');
    expect(calls, 'cache-first went to the network with the entry right there').toEqual([]);
  });

  it('§6.2 `Vary: *` is not a reason to go to the network either', async () => {
    const { store, fake, calls } = varyingStore(() => varying('never'));
    await fake.put(precacheRequest(), varying('main()', '*'));
    expect(await (await store.get(moduleRequest(), 'cache-first', null)).text()).toBe('main()');
    expect(calls).toEqual([]);
  });

  it('§6.3 delete removes an entry that another kind of request wrote', async () => {
    // This is `invalidate()`: the entry was written by a page request (with `Origin`) and
    // the router asks for it to be dropped by plain URL. A delete that does not match
    // does not invalidate — and reports success it did not have.
    const { store, fake } = varyingStore(() => varying('x'));
    await fake.put(moduleRequest(), varying('main()'));
    expect(await store.delete(URL_MAIN)).toBe(true);
    expect(await store.keys()).toEqual([]);
  });

  it('§6.4 one URL is one entry, whoever asks for it', async () => {
    const { store } = varyingStore(() => varying('main()'));
    // Three consumers of the same URL: a module, an image, a plain fetch.
    for (const headers of [
      { origin: 'https://app.test', accept: '*/*' },
      { accept: 'image/*' },
      {},
    ]) {
      await store.get(new Request(URL_MAIN, { headers }), 'cache-first', null);
    }
    expect(await store.keys()).toEqual([URL_MAIN]);
  });

  it('§6.4 the entry budget therefore counts resources, not combinations', async () => {
    const { store } = varyingStore(() => varying('x'));
    await store.get(new Request(`${URL_MAIN}?a`, { headers: { origin: 'https://app.test' } }), 'cache-first', null);
    await store.get(new Request(`${URL_MAIN}?a`, { headers: { accept: 'image/*' } }), 'cache-first', null);
    await store.get(new Request(`${URL_MAIN}?b`), 'cache-first', null);
    // Two distinct URLs — the query IS part of the identity — so prune(1) leaves one.
    expect(await store.keys()).toHaveLength(2);
    await store.prune(1);
    expect(await store.keys()).toEqual([`${URL_MAIN}?b`]);
  });

  it('§6.5 a string and a Request for the same URL share entry and in-flight dedup', async () => {
    const { store, calls } = varyingStore(() => varying('once'));
    const [a, b] = await Promise.all([
      store.get(URL_MAIN, 'cache-first', null),
      store.get(moduleRequest(), 'cache-first', null),
    ]);
    expect(calls, 'the two forms must be one key').toHaveLength(1);
    expect(await a.text()).toBe('once');
    expect(await b.text()).toBe('once');
  });

  it('§6.6 the network leg gets the ORIGINAL request, headers included', async () => {
    const seen: Request[] = [];
    const { cache } = varyingCache();
    const store = createStore({
      cache,
      net: async (request) => {
        seen.push(request);
        return new Response('live');
      },
    });
    await store.get(moduleRequest(), 'network-only', null);
    expect(seen[0]?.headers.get('origin')).toBe('https://app.test');
    expect(seen[0]?.url).toBe(URL_MAIN);
  });

  it('§6.7 a 206 is served and not stored: cache.put would have thrown', async () => {
    const { store, fake } = varyingStore(
      () => new Response('bytes', { status: 206, headers: { 'content-range': 'bytes 0-4/10' } }),
    );
    const response = await store.get(URL_MAIN, 'cache-first', null);
    expect(response.status).toBe(206);
    expect(await response.text()).toBe('bytes');
    expect(fake.entries).toEqual([]);
  });

  it('§6.8 a cache that cannot store does not fail the response', async () => {
    const calls: string[] = [];
    const store = createStore({
      cache: {
        match: async () => undefined,
        put: async () => {
          throw new Error('QuotaExceededError');
        },
        delete: async () => false,
        keys: async () => [],
      } as unknown as Cache,
      net: async (request) => {
        calls.push(request.url);
        return new Response('served anyway');
      },
    });
    expect(await (await store.get(URL_MAIN, 'cache-first', null)).text()).toBe('served anyway');
    expect(calls).toHaveLength(1);
  });
});

/** The seams that exist so this module is testable, exercised at their defaults. */
describe('Store — defaults and edges', () => {
  it('treats an entry with no stamp as infinitely old, so a TTL refetches it', async () => {
    // Anything written into the cache from outside the Store — a precache that predates
    // BUG-04, a devtools edit — has no `x-fudic-stored`. With a TTL that must not be read
    // as "stored at epoch 0 is fine".
    const { cache, fake } = fakeCache();
    await fake.put('https://app.test/d.json', new Response('unstamped'));
    const calls: string[] = [];
    const store = createStore({
      cache,
      now: () => 1_000_000,
      net: async (request) => {
        calls.push(request.url);
        return new Response('fresh');
      },
    });
    expect(await (await store.get('https://app.test/d.json', 'cache-first', MINUTE)).text()).toBe(
      'fresh',
    );
    expect(calls).toHaveLength(1);
  });

  it('falls back to the real clock and the platform fetch when neither is injected', async () => {
    const { cache, fake } = fakeCache();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('from the platform'));
    try {
      const store = createStore({ cache });
      const response = await store.get('https://app.test/platform', 'network-only', null);
      expect(await response.text()).toBe('from the platform');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      // The default clock stamped it with something recent, not with 0.
      const stored = [...fake.entries.values()][0]!;
      expect(Number(stored.headers.get(STAMP_HEADER))).toBeGreaterThan(1_700_000_000_000);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('stale-while-revalidate does NOT revalidate while the copy is still fresh', async () => {
    const { store, clock, calls } = makeStore(() => new Response('v'));
    await store.get('https://app.test/swr', 'stale-while-revalidate', 5 * MINUTE);
    clock.t += MINUTE;
    expect(await (await store.get('https://app.test/swr', 'stale-while-revalidate', 5 * MINUTE)).text()).toBe(
      'v',
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls, 'a fresh copy must not trigger a background fetch').toHaveLength(1);
  });

  it('a failed background revalidation does not surface anywhere', async () => {
    const { cache } = fakeCache();
    const clock = { t: 1_000_000 };
    let fail = false;
    const store = createStore({
      cache,
      now: () => clock.t,
      net: async () => {
        if (fail) throw new Error('offline');
        return new Response('v1');
      },
    });
    await store.get('https://app.test/swr', 'stale-while-revalidate', MINUTE);
    clock.t += 2 * MINUTE;
    fail = true;
    // Stale copy out, revalidation out, revalidation rejects: nobody hears about it.
    expect(await (await store.get('https://app.test/swr', 'stale-while-revalidate', MINUTE)).text()).toBe(
      'v1',
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe('Store.prune', () => {
  it('§6.12 keeps the last inserted entries (FIFO)', async () => {
    const { store, fake } = makeStore(() => new Response('x'));
    for (const n of [1, 2, 3, 4]) {
      await store.put(`https://app.test/${n}`, new Response(String(n)));
    }
    await store.prune(2);
    expect(await store.keys()).toEqual(['https://app.test/3', 'https://app.test/4']);
    expect(fake.entries.size).toBe(2);
  });

  it('prunes nothing when under the limit, and deletes on demand', async () => {
    const { store } = makeStore(() => new Response('x'));
    await store.put('https://app.test/1', new Response('1'));
    await store.prune(5);
    expect(await store.keys()).toHaveLength(1);
    expect(await store.delete('https://app.test/1')).toBe(true);
    expect(await store.match('https://app.test/1')).toBeUndefined();
  });
});
