/** SDD-20 §6.1–§6.3: the manifest is the single route contract, matched synchronously. */

import { describe, expect, it } from 'vitest';
import {
  compileManifest,
  fillParams,
  loadManifest,
  type ManifestFile,
} from '../src/manifest.js';
import { DEFAULT_CSP } from '../src/csp.js';
import { fakeCache, varyingCache } from './helpers.js';

const FILE: ManifestFile = {
  build: 'a3f9c1',
  csp: DEFAULT_CSP,
  routes: [
    // Ordered by DESCENDING specificity: static before param.
    { pattern: '/blog/new', mode: 'ssg', chunk: '/sw/c/blog-new.js' },
    { pattern: '/blog/:slug', mode: 'sw', chunk: '/sw/c/blog.js', deps: ['/sw/c/badge.js'] },
    { pattern: '/account', mode: 'ssr' },
  ],
};

describe('compileManifest', () => {
  it('§6.1 matches by descending specificity and extracts params', () => {
    const table = compileManifest(FILE);
    expect(table.match('/blog/new')?.record.mode).toBe('ssg');
    const hit = table.match('/blog/x');
    expect(hit?.record.pattern).toBe('/blog/:slug');
    expect(hit?.params).toEqual({ slug: 'x' });
    expect(table.match('/nope')).toBeNull();
  });

  it('§6.1 ignores the query string and decodes param values', () => {
    const table = compileManifest(FILE);
    expect(table.match('/blog/hello%20world?ref=x')?.params).toEqual({ slug: 'hello world' });
  });

  it('§6.2 two instances of one template resolve to the SAME record', () => {
    const table = compileManifest(FILE);
    expect(table.templateOf('/blog/a')).toBe(table.templateOf('/blog/b'));
    expect(table.templateOf('/blog/new')).toBeNull(); // ssg is not a sw template
    expect(table.templateOf('/nope')).toBeNull();
  });

  it('exposes build and csp for the router', () => {
    const table = compileManifest(FILE);
    expect(table.build).toBe('a3f9c1');
    expect(table.csp.sw).toContain('unsafe-eval');
  });
});

describe('fillParams', () => {
  it('fills declared params and percent-encodes them', () => {
    expect(fillParams('/_fudic/data/blog/:slug', { slug: 'a b' })).toBe('/_fudic/data/blog/a%20b');
  });

  it('leaves a placeholder alone when the param is missing', () => {
    expect(fillParams('/blog/:slug', {})).toBe('/blog/:slug');
  });
});

describe('loadManifest', () => {
  it('§6.3 reads from the cache and never touches the network', async () => {
    const { cache, fake } = fakeCache();
    await fake.put('https://app.test/fudic-routes.json', new Response(JSON.stringify(FILE)));
    const table = await loadManifest('https://app.test/fudic-routes.json', cache);
    expect(table.build).toBe('a3f9c1');
  });

  it('§6.3 rejects when the manifest is not cached', async () => {
    const { cache } = fakeCache();
    await expect(loadManifest('https://app.test/fudic-routes.json', cache)).rejects.toThrow(
      /not in cache/u,
    );
  });

  it('BUG-04 §6.9 finds it even when another kind of request wrote the entry', async () => {
    // `/fudic-routes.json` is a SERVABLE shell entry (BUG-01 §4.3), so a document can ask
    // for it — with an `Origin` header. On a `Vary: Origin` response that rewrites the
    // entry under a key this string-based lookup would no longer match, `build()` would
    // throw, and the router would never become ready: the Service Worker stops
    // intercepting ALTOGETHER, silently, until the next build. Total loss of function.
    const { cache, fake } = varyingCache();
    await fake.put(
      new Request('https://app.test/fudic-routes.json', { headers: { origin: 'https://app.test' } }),
      new Response(JSON.stringify(FILE), { headers: { vary: 'Origin' } }),
    );
    const table = await loadManifest('https://app.test/fudic-routes.json', cache);
    expect(table.build).toBe('a3f9c1');
  });
});
