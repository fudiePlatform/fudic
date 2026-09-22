import { describe, expect, it } from 'vitest';

import { RUNTIME_MARKER_TTL, sweepRuntimeCaches } from '../src/runtime-cache.js';
import { isStaleCache } from '../src/store.js';

/**
 * Who deletes the shared runtime cache (SDD-45 §4.9).
 *
 * The whole mechanism is testable without a worker because both the clock and the
 * `CacheStorage` are injected, and that is deliberate: a default that reached for the real
 * globals would be a branch nobody ever exercises, sitting in the one place where getting it
 * wrong deletes another application's framework.
 */

/** The origin of the worker these caches belong to, which is what relative keys resolve to. */
const ORIGIN = 'https://shop.test';

/**
 * A `Cache` double that RESOLVES its keys, which is what the real one does and what this
 * mechanism depends on: the marker arrives as `/_fudic/marker/<app>`, relative, because that
 * is what a worker writes — and `keys()` hands back absolute `Request`s, which is why the
 * sweep reads a pathname out of each one rather than comparing strings.
 */
class MarkCache {
  readonly entries = new Map<string, Response>();

  async match(request: Request | string): Promise<Response | undefined> {
    return this.entries.get(this.#key(request))?.clone();
  }

  async put(request: Request | string, response: Response): Promise<void> {
    this.entries.set(this.#key(request), response);
  }

  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((url) => new Request(url));
  }

  #key(request: Request | string): string {
    return new URL(typeof request === 'string' ? request : request.url, ORIGIN).href;
  }
}

/** A `CacheStorage` double: named caches, `keys()` in insertion order. */
class FakeCacheStorage {
  readonly caches = new Map<string, MarkCache>();

  async open(name: string): Promise<Cache> {
    let cache = this.caches.get(name);
    if (cache === undefined) {
      cache = new MarkCache();
      this.caches.set(name, cache);
    }
    return cache as unknown as Cache;
  }

  async keys(): Promise<string[]> {
    return [...this.caches.keys()];
  }

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name);
  }
}

const PREFIX = 'fudic-runtime-';
const MARKER = '/_fudic/marker/shop';

/** A cache of `version` holding one mark per app, each written at the given time. */
async function withMarks(
  storage: FakeCacheStorage,
  version: string,
  marks: Readonly<Record<string, number>>,
): Promise<MarkCache> {
  const cache = (await storage.open(`${PREFIX}${version}`)) as unknown as MarkCache;
  for (const [app, at] of Object.entries(marks)) {
    await cache.put(`/_fudic/marker/${app}`, new Response(String(at)));
  }
  return cache;
}

const sweep = (
  storage: FakeCacheStorage,
  cache: string,
  now: number,
): Promise<readonly string[]> =>
  sweepRuntimeCaches({
    caches: storage as unknown as CacheStorage,
    cache,
    prefix: PREFIX,
    marker: MARKER,
    now: () => now,
  });

describe('isStaleCache and the shared runtime cache', () => {
  it('never recognises the runtime cache, for any app and any build', () => {
    // Criterion 21, and it protects against a FIX rather than against a defect: the predicate
    // knows four kinds — `shell-`, `routes-`, `pages-`, `data-` — and this cache is none of
    // them, which is exactly why it is named outside the scheme. Widen those four, or reach
    // for a shorter `startsWith`, and two applications of one origin go back to deleting each
    // other's framework, with no symptom until the deploy after.
    for (const app of ['shop', 'admin', '']) {
      for (const build of ['abc12345', 'zzz99999', '']) {
        expect(isStaleCache('fudic-runtime-0.0.1', app, build)).toBe(false);
        expect(isStaleCache('fudic-runtime-0.0.1-beta.1', app, build)).toBe(false);
      }
    }
    // And the four kinds still answer, so the loop above is not passing by accident.
    expect(isStaleCache('shell-shop-abc12345', 'shop', 'zzz99999')).toBe(true);
    expect(isStaleCache('shell-shop-zzz99999', 'shop', 'zzz99999')).toBe(false);
  });
});

describe('sweepRuntimeCaches', () => {
  it('writes this application mark, with the date, into its own cache', async () => {
    const storage = new FakeCacheStorage();
    const at = Date.parse('2026-03-01T00:00:00Z');

    const deleted = await sweep(storage, `${PREFIX}0.0.1`, at);

    const mine = storage.caches.get(`${PREFIX}0.0.1`) as MarkCache;
    const mark = await mine.match(MARKER);
    expect(await (mark as Response).text()).toBe(String(at));
    expect(deleted).toEqual([]);
  });

  it('skips its OWN cache rather than re-examining it', async () => {
    const storage = new FakeCacheStorage();
    const at = Date.parse('2026-03-01T00:00:00Z');
    // Our own cache carrying nothing but a mark long expired. The mark just written keeps it,
    // and skipping by name is cheaper than proving that.
    await withMarks(storage, '0.0.1', { shop: 0 });

    expect(await sweep(storage, `${PREFIX}0.0.1`, at)).toEqual([]);
    expect(storage.caches.has(`${PREFIX}0.0.1`)).toBe(true);
  });

  it('deletes a version whose marks have ALL expired', async () => {
    const storage = new FakeCacheStorage();
    const at = Date.parse('2026-03-01T00:00:00Z');
    await withMarks(storage, '0.0.2', {
      shop: at - RUNTIME_MARKER_TTL,
      admin: at - RUNTIME_MARKER_TTL - 1,
    });

    // Exactly at the TTL counts as expired: thirty days is how long a mark counts as alive.
    expect(await sweep(storage, `${PREFIX}0.0.1`, at)).toEqual([`${PREFIX}0.0.2`]);
    expect(storage.caches.has(`${PREFIX}0.0.2`)).toBe(false);
  });

  it('keeps a version with ONE living mark, whoever left it', async () => {
    const storage = new FakeCacheStorage();
    const at = Date.parse('2026-03-01T00:00:00Z');
    await withMarks(storage, '0.0.2', {
      shop: at - RUNTIME_MARKER_TTL,
      admin: at - RUNTIME_MARKER_TTL + 1,
    });

    // One application still on that version is enough. Nothing here asks it anything.
    expect(await sweep(storage, `${PREFIX}0.0.1`, at)).toEqual([]);
    expect(storage.caches.has(`${PREFIX}0.0.2`)).toBe(true);
  });

  it('keeps a version with NO marks, and that is the decision and not the omission', async () => {
    const storage = new FakeCacheStorage();
    const at = Date.parse('2026-03-01T00:00:00Z');
    // Pieces but no mark: the shape of a version whose pages are being served right now by a
    // worker that has not activated yet — the fetch handler writes the pieces, `activate`
    // writes the mark. Deleting it throws away bytes somebody is mid-download of (§4.9). A
    // test that expects it gone inverts the decision without anybody noticing.
    const fresh = (await storage.open(`${PREFIX}0.0.3`)) as unknown as MarkCache;
    await fresh.put('/_fudic/0.0.3/core/hydrate.js', new Response('pieces'));

    expect(await sweep(storage, `${PREFIX}0.0.1`, at)).toEqual([]);
    expect(storage.caches.has(`${PREFIX}0.0.3`)).toBe(true);
  });

  it('counts an unreadable mark as expired', async () => {
    const storage = new FakeCacheStorage();
    const at = Date.parse('2026-03-01T00:00:00Z');
    const cache = await withMarks(storage, '0.0.2', { admin: at });
    // Only reachable if something deletes the entry between listing it and reading it. What
    // matters is which way it falls, and it falls towards deleting the version: to survive, a
    // version needs one living mark from SOMEBODY, and an absent mark is nobody's.
    const listing = await cache.keys();
    cache.entries.clear();
    cache.keys = async (): Promise<Request[]> => listing;

    expect(await sweep(storage, `${PREFIX}0.0.1`, at)).toEqual([`${PREFIX}0.0.2`]);
  });

  it('opens only the caches of the family, so each app four caches are untouched', async () => {
    const storage = new FakeCacheStorage();
    const at = Date.parse('2026-03-01T00:00:00Z');
    for (const name of ['shell-shop-abc', 'routes-shop-abc', 'pages-shop-abc', 'data-shop-abc']) {
      await storage.open(name);
    }
    await withMarks(storage, '0.0.2', { shop: 0 });

    expect(await sweep(storage, `${PREFIX}0.0.1`, at)).toEqual([`${PREFIX}0.0.2`]);
    expect(await storage.keys()).toEqual([
      'shell-shop-abc',
      'routes-shop-abc',
      'pages-shop-abc',
      'data-shop-abc',
      `${PREFIX}0.0.1`,
    ]);
  });

  it('takes the prefix GIVEN, so a prerelease does not cut in the wrong place', async () => {
    const storage = new FakeCacheStorage();
    const at = Date.parse('2026-03-01T00:00:00Z');
    await withMarks(storage, '0.0.1', { shop: 0 });

    // Trimmed off our own name, `fudic-runtime-0.0.1-beta.1` would yield the prefix
    // `fudic-runtime-0.0.1-` and the sweep would stop seeing the release it upgraded from.
    // The prefix arrives from `@fudic/conventions` instead, so it cannot be derived wrongly.
    expect(await sweep(storage, `${PREFIX}0.0.1-beta.1`, at)).toEqual([`${PREFIX}0.0.1`]);
  });

  it('defaults its clock to the real one when none is injected', async () => {
    const storage = new FakeCacheStorage();
    const before = Date.now();
    await sweepRuntimeCaches({
      caches: storage as unknown as CacheStorage,
      cache: `${PREFIX}0.0.1`,
      prefix: PREFIX,
      marker: MARKER,
    });

    const mine = storage.caches.get(`${PREFIX}0.0.1`) as MarkCache;
    const mark = await mine.match(MARKER);
    expect(Number(await (mark as Response).text())).toBeGreaterThanOrEqual(before);
  });
});
