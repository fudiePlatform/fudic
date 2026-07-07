import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadManifest } from '../src/index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const MANIFEST_JSON = {
  '/': { dynamic: true, chunk: './home.chunk.js' },
  '/static/logo': { dynamic: false, chunk: '' },
};

describe('loadManifest (SDD-16 §6.12)', () => {
  it('two loads from the same URL give the same match (single source)', async () => {
    const fetchFake = vi.fn(async () => new Response(JSON.stringify(MANIFEST_JSON)));
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
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(MANIFEST_JSON)));
    const manifest = await loadManifest('https://app.test/manifest.json');
    expect(manifest.match('/nowhere')).toBeNull();
  });
});
