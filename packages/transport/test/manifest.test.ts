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
  base: '/',
  csp: DEFAULT_CSP,
  routes: [
    // Ordered by DESCENDING specificity: static before param.
    { pattern: '/blog/new', mode: 'ssg', deps: [] },
    { pattern: '/blog/:slug', mode: 'sw', deps: ['badge'] },
    { pattern: '/account', mode: 'ssr' },
  ],
};

/** The same application, published under a non-root `base` — BUG-39. */
const UNDER_BASE: ManifestFile = {
  ...FILE,
  base: '/admin/',
  routes: [...FILE.routes, { pattern: '/', mode: 'ssg', deps: [] }],
};

describe('compileManifest', () => {
  it('BUG-39 matches a pathname under `base`: the URL carries it, the patterns do not', () => {
    const table = compileManifest(UNDER_BASE);
    // What the fetch handler holds is `url.pathname`, base and all. What the manifest
    // stores is the pattern the build named, base excluded. Matching one against the other
    // is what made an app under a `base` decline every one of its own navigations.
    expect(table.match('/admin/blog/new')?.record.mode).toBe('ssg');
    expect(table.match('/admin/blog/x')?.params).toEqual({ slug: 'x' });
    // The index of the app is `base` itself, with and without the trailing slash.
    expect(table.match('/admin/')?.record.pattern).toBe('/');
    expect(table.match('/admin')?.record.pattern).toBe('/');
    // And what lies outside the base belongs to somebody else on this origin.
    expect(table.match('/blog/new')).toBeNull();
    expect(table.match('/')).toBeNull();
  });

  it('BUG-39 a record keeps the pattern the build named, so its chunk URL still resolves', () => {
    const table = compileManifest(UNDER_BASE);
    const hit = table.match('/admin/blog/x')!;
    expect(hit.record.pattern).toBe('/blog/:slug');
    expect(table.urls.renderUrl(hit.record)).toBe('/admin/sw/c/blog-slug-a3f9c1.js');
  });

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

  it('SDD-17 §4.7 states what a tag’s hydration chunk imports, base applied', () => {
    const table = compileManifest({
      ...FILE,
      hydrate: { 'app-counter': ['assets/element-DUSE73WP.js'] },
    });
    expect(table.hydrateDeps('app-counter')).toEqual(['/assets/element-DUSE73WP.js']);
    // A BARE name is the common case: where it lives is arithmetic, so the build id and
    // the extension are added here. A name that already ends in `.js` kept a content hash
    // and is used verbatim — those are the two shapes, and both are published.
    expect(
      compileManifest({ ...FILE, hydrate: { 'app-counter': ['element'] } }).hydrateDeps(
        'app-counter',
      ),
    ).toEqual(['/element-a3f9c1.js']);
    // A tag with no shared code, and a tag this build never heard of — a stale page asking
    // for a component that no longer exists — are the same answer: nothing to drag along.
    expect(table.hydrateDeps('app-toggle')).toEqual([]);
  });

  it('a build where nothing shares code publishes no map at all', () => {
    expect(compileManifest(FILE).hydrateDeps('app-counter')).toEqual([]);
  });

  it('exposes a resolver already bound to this build (SDD-27 §5.4)', () => {
    const table = compileManifest(FILE);
    const hit = table.match('/blog/x')!;
    expect(table.urls.renderUrl(hit.record)).toBe('/sw/c/blog-slug-a3f9c1.js');
    expect(table.urls.depUrl('badge')).toBe('/sw/c/badge-a3f9c1.js');
    // A route with no `deps` is not renderable here, whatever its mode says.
    expect(table.urls.renderUrl(table.match('/account')!.record)).toBeNull();
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
