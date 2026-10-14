/**
 * BUG-47 criterion 6 — the Service Worker's runtime cache is named by the fingerprinted segment,
 * and a cache of another fingerprint whose marks have expired is swept.
 *
 * Driven end to end over the real pieces: discovery writes the URL, `runtimeCacheOf` reads the
 * cache name back out of it, and `@fudic/transport`'s sweep — unchanged by this bug — retires
 * the old one. Only the file system and the `CacheStorage` are doubles.
 */

import { describe, expect, it } from 'vitest';
import { RUNTIME_MARKER_TTL, sweepRuntimeCaches } from '@fudic/transport';

import { runtimePieces, type RuntimeFs } from '../src/runtime-pieces.js';
import { runtimeCacheOf, runtimeLinkage } from '../src/runtime-link.js';

const PROJECT = '/repo/app';
const CORE = `${PROJECT}/node_modules/@fudic/core`;

/** The project with `@fudic/core` 0.0.1 publishing one `signal.js` with these bytes. */
function world(signal: string): RuntimeFs {
  const files: Record<string, string> = {
    [`${PROJECT}/package.json`]: JSON.stringify({ name: 'app', dependencies: { '@fudic/core': '*' } }),
    [`${CORE}/package.json`]: JSON.stringify({ name: '@fudic/core', version: '0.0.1', fudic: { runtime: 'runtime' } }),
    [`${CORE}/runtime/signal.js`]: signal,
  };
  return {
    readFile: (path) => files[path],
    readDir: (dir) => (dir === `${CORE}/runtime` ? ['signal.js'] : undefined),
    realPath: (path) => path,
    readBytes: (file) => new TextEncoder().encode(files[file] ?? ''),
  };
}

/** The cache name a build of that project gives its Service Worker. */
function cacheOf(signal: string): string {
  const io = world(signal);
  return runtimeCacheOf(runtimeLinkage(runtimePieces(PROJECT, io).pieces, io));
}

/** A `Cache` double that resolves its keys against the worker's origin, as the real one does. */
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
    return new URL(typeof request === 'string' ? request : request.url, 'https://shop.test').href;
  }
}

class FakeCacheStorage {
  readonly caches = new Map<string, MarkCache>();

  async open(name: string): Promise<MarkCache> {
    const cache = this.caches.get(name) ?? new MarkCache();
    this.caches.set(name, cache);
    return cache;
  }

  async keys(): Promise<string[]> {
    return [...this.caches.keys()];
  }

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name);
  }
}

describe('BUG-47 criterion 6: the runtime cache', () => {
  it('is named `fudic-runtime-<version>-<fingerprint>`, out of the new segment', () => {
    expect(cacheOf('export const signal = 1;')).toMatch(/^fudic-runtime-0\.0\.1-[0-9a-f]{8}$/u);
  });

  it('another runtime under the same version is another cache; the same bytes, the same cache', () => {
    expect(cacheOf('export const signal = 2;')).not.toBe(cacheOf('export const signal = 1;'));
    expect(cacheOf('export const signal = 1;')).toBe(cacheOf('export const signal = 1;'));
  });

  it('a cache of another fingerprint with its marks expired is swept; one still marked stays', async () => {
    const old = cacheOf('export const signal = 1;');
    const current = cacheOf('export const signal = 2;');
    const marked = cacheOf('export const signal = 3;');
    const now = 10 * RUNTIME_MARKER_TTL;
    const storage = new FakeCacheStorage();
    await (await storage.open(old)).put('/_fudic/marker/shop', new Response(String(now - RUNTIME_MARKER_TTL)));
    await (await storage.open(marked)).put('/_fudic/marker/blog', new Response(String(now - 1)));

    const deleted = await sweepRuntimeCaches({
      caches: storage as unknown as Parameters<typeof sweepRuntimeCaches>[0]['caches'],
      cache: current,
      prefix: 'fudic-runtime-',
      marker: '/_fudic/marker/shop',
      now: () => now,
    });

    expect(deleted).toEqual([old]);
    expect([...storage.caches.keys()].sort()).toEqual([current, marked].sort());
  });
});
