/**
 * SDD-19 §4.8/§4.9: the three-thread bootstraps the plugin emits — WW render server,
 * SW router with version-based cache purge, and the main-thread SW registration.
 */

import { describe, it, expect } from 'vitest';
import { emitWwBootstrap, emitSwBootstrap, emitMainBootstrap } from '../src/bootstrap.js';

describe('emitWwBootstrap', () => {
  it('loads the shared manifest and installs the render worker', () => {
    const code = emitWwBootstrap('"/fudic-routes.json"');
    expect(code).toContain("import { loadManifest, installRenderWorker } from '@fudic/transport';");
    expect(code).toContain('loadManifest("/fudic-routes.json")');
    expect(code).toContain('installRenderWorker(manifest)');
  });
});

describe('emitSwBootstrap', () => {
  const code = emitSwBootstrap('"/fudic-routes.json"', 'import.meta.ROLLUP_FILE_URL_ww', 'fudic-v1');

  it('wires the cache-first router over the render worker', () => {
    expect(code).toContain("import { loadManifest, createRouter, controlBus } from '@fudic/transport';");
    expect(code).toContain('createRouter({ manifest, worker, cache })');
    expect(code).toContain('new Worker(import.meta.ROLLUP_FILE_URL_ww, { type: \'module\' })');
    expect(code).toContain("addEventListener('fetch'");
  });

  it('wires control-channel purge and version invalidation (§4.9)', () => {
    expect(code).toContain('controlBus().on(');
    expect(code).toContain('cache.delete(msg.route)');
    expect(code).toContain('caches.delete(CACHE)');
  });
});

describe('emitMainBootstrap', () => {
  it('registers the service worker behind a feature check', () => {
    const code = emitMainBootstrap('import.meta.ROLLUP_FILE_URL_sw');
    expect(code).toContain("import { registerRenderServiceWorker } from '@fudic/transport';");
    expect(code).toContain("'serviceWorker' in navigator");
    expect(code).toContain('registerRenderServiceWorker(import.meta.ROLLUP_FILE_URL_sw)');
  });
});
