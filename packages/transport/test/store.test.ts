/** SDD-20 §6.10–§6.12: policy, TTL by stamp, in-flight dedup and FIFO pruning. */

import { describe, expect, it } from 'vitest';
import { cacheNames, createStore, isStaleCache, STAMP_HEADER } from '../src/store.js';
import { fakeCache } from './helpers.js';

const MINUTE = 60_000;

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

describe('Store.prune', () => {
  it('§6.12 keeps the last inserted entries (FIFO)', async () => {
    const { store, fake } = makeStore(() => new Response('x'));
    for (const n of [1, 2, 3, 4]) {
      await store.put(new Request(`https://app.test/${n}`), new Response(String(n)));
    }
    await store.prune(2);
    expect(await store.keys()).toEqual(['https://app.test/3', 'https://app.test/4']);
    expect(fake.entries.size).toBe(2);
  });

  it('prunes nothing when under the limit, and deletes on demand', async () => {
    const { store } = makeStore(() => new Response('x'));
    await store.put(new Request('https://app.test/1'), new Response('1'));
    await store.prune(5);
    expect(await store.keys()).toHaveLength(1);
    expect(await store.delete(new Request('https://app.test/1'))).toBe(true);
    expect(await store.match(new Request('https://app.test/1'))).toBeUndefined();
  });
});
