import { afterEach, describe, expect, it, vi } from 'vitest';
import { type RouteManifestFile, loadManifest } from '../src/index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

// Ordered by descending specificity (the plugin emits it so): the static
// `/customer/new` sits before the param `/customer/:id`.
const MANIFEST: RouteManifestFile = [
  { pattern: '/', dynamic: true, chunk: './home.chunk.js' },
  { pattern: '/static/logo', dynamic: false, chunk: '' },
  { pattern: '/customer/new', dynamic: true, chunk: './customer-new.chunk.js' },
  { pattern: '/customer/:id', dynamic: true, chunk: './customer.chunk.js' },
];

describe('loadManifest (SDD-16 §6.12, SDD-19 §4.7)', () => {
  it('two loads from the same URL give the same match (single source)', async () => {
    const fetchFake = vi.fn(async () => new Response(JSON.stringify(MANIFEST)));
    vi.stubGlobal('fetch', fetchFake);

    const url = 'https://app.test/manifest.json';
    const sw = await loadManifest(url);
    const ww = await loadManifest(url);

    expect(fetchFake).toHaveBeenCalledTimes(2);
    expect(fetchFake).toHaveBeenCalledWith(url);
    expect(sw.match('/')).toEqual(ww.match('/'));
    expect(sw.match('/')).toEqual({ dynamic: true, chunk: './home.chunk.js' });
    expect(sw.match('/static/logo')?.dynamic).toBe(false);
  });

  it('an absent route matches null', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(MANIFEST)));
    const manifest = await loadManifest('https://app.test/manifest.json');
    expect(manifest.match('/nowhere')).toBeNull();
    expect(manifest.match('/customer')).toBeNull(); // segment count differs
    expect(manifest.match('/customer/1/extra')).toBeNull();
  });

  it('a param segment matches any concrete id', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(MANIFEST)));
    const manifest = await loadManifest('https://app.test/manifest.json');
    expect(manifest.match('/customer/42')).toEqual({ dynamic: true, chunk: './customer.chunk.js' });
    expect(manifest.match('/customer/43')).toEqual({ dynamic: true, chunk: './customer.chunk.js' });
  });

  it('a static route wins over a param route by manifest order (specificity)', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(MANIFEST)));
    const manifest = await loadManifest('https://app.test/manifest.json');
    expect(manifest.match('/customer/new')).toEqual({
      dynamic: true,
      chunk: './customer-new.chunk.js',
    });
  });

  it('ignores the query string when matching', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(MANIFEST)));
    const manifest = await loadManifest('https://app.test/manifest.json');
    expect(manifest.match('/customer/42?tab=orders')?.chunk).toBe('./customer.chunk.js');
  });
});
