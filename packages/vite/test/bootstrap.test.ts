/**
 * SDD-19 §4.8/§4.9: the three-thread bootstraps the plugin emits — WW render server,
 * SW router with version-based cache purge, and the main-thread registration that
 * creates the Web Worker and joins it to the Service Worker.
 */

import { describe, it, expect } from 'vitest';
import { emitWwBootstrap, emitSwBootstrap, emitMainBootstrap } from '../src/bootstrap.js';

describe('emitWwBootstrap', () => {
  const code = emitWwBootstrap('"/fudic-routes.json"');

  it('loads the shared manifest and installs the render worker on the transferred port', () => {
    expect(code).toContain(
      "import { loadManifest, installRenderWorker, WORKER_PORT_MESSAGE } from '@fudic/transport';",
    );
    expect(code).toContain('loadManifest("/fudic-routes.json")');
    expect(code).toContain('installRenderWorker(manifest, port)');
  });

  it('never constructs its own channel: it waits for the main thread to hand one over', () => {
    expect(code).toContain('e.data.type === WORKER_PORT_MESSAGE');
    expect(code).not.toContain('new MessageChannel');
  });
});

describe('emitSwBootstrap', () => {
  const code = emitSwBootstrap('"/fudic-routes.json"', 'fudic-v1');

  it('wires the cache-first router over the render worker', () => {
    expect(code).toContain(
      "import { loadManifest, createRouter, controlBus, WORKER_PORT_MESSAGE } from '@fudic/transport';",
    );
    expect(code).toContain('createRouter({ manifest, worker, cache })');
    expect(code).toContain("addEventListener('fetch'");
  });

  it('never constructs a Worker: that scope exposes neither `Worker` nor `import()`', () => {
    expect(code).not.toContain('new Worker');
    expect(code).toContain('e.data.type === WORKER_PORT_MESSAGE');
  });

  it('does not intercept a navigation until a render port is connected', () => {
    expect(code).toContain('if (workerPort === null) return;');
  });

  it('wires control-channel purge and version invalidation (§4.9)', () => {
    expect(code).toContain('controlBus().on(');
    expect(code).toContain('cache.delete(msg.route)');
    expect(code).toContain('caches.delete(CACHE)');
  });
});

describe('emitMainBootstrap', () => {
  it('registers the service worker and joins the render worker to it', () => {
    const code = emitMainBootstrap(
      'import.meta.ROLLUP_FILE_URL_sw',
      'import.meta.ROLLUP_FILE_URL_ww',
    );
    expect(code).toContain(
      "import { registerRenderServiceWorker, connectRenderWorker } from '@fudic/transport';",
    );
    expect(code).toContain("'serviceWorker' in navigator");
    expect(code).toContain('registerRenderServiceWorker(import.meta.ROLLUP_FILE_URL_sw)');
    expect(code).toContain('connectRenderWorker(import.meta.ROLLUP_FILE_URL_ww)');
  });
});
