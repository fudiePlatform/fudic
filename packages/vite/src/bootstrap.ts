/**
 * The three-thread bootstraps the plugin emits (SDD-19 §4.8). `main.ts` of SDD-16
 * left the SW lifecycle "out of scope, build concern" — it lives here. Each URL is a
 * JS expression (a `import.meta.ROLLUP_FILE_URL_<ref>` so Rollup fills the real hashed
 * URL, guaranteeing SW and WW load the SAME manifest).
 */

/** WW entry: load the shared manifest and serve renders. */
export function emitWwBootstrap(manifestUrlExpr: string): string {
  return `import { loadManifest, installRenderWorker } from '@fudic/transport';

loadManifest(${manifestUrlExpr}).then((manifest) => installRenderWorker(manifest));
`;
}

/** SW entry: the single cache hit/miss router + version-based cache purge (SDD-19 §4.9). */
export function emitSwBootstrap(manifestUrlExpr: string, wwUrlExpr: string, cacheName: string): string {
  return `import { loadManifest, createRouter, controlBus } from '@fudic/transport';

const CACHE = ${JSON.stringify(cacheName)};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

let routerPromise;
function router() {
  if (!routerPromise) {
    routerPromise = (async () => {
      const manifest = await loadManifest(${manifestUrlExpr});
      const worker = new Worker(${wwUrlExpr}, { type: 'module' });
      const cache = await caches.open(CACHE);
      controlBus().on((msg) => {
        if (msg.type === 'purge' || msg.type === 'invalidate') cache.delete(msg.route);
        else if (msg.type === 'version') caches.delete(CACHE);
      });
      return createRouter({ manifest, worker, cache });
    })();
  }
  return routerPromise;
}

self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith((async () => {
    const r = await router();
    let response;
    r.handle({ request: e.request, respondWith: (res) => { response = res; } });
    return response !== undefined ? await response : fetch(e.request);
  })());
});
`;
}

/** Main-thread entry: register the render Service Worker. */
export function emitMainBootstrap(swUrlExpr: string): string {
  return `import { registerRenderServiceWorker } from '@fudic/transport';

if ('serviceWorker' in navigator) {
  registerRenderServiceWorker(${swUrlExpr});
}
`;
}
