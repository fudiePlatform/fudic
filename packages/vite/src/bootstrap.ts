/**
 * The three-thread bootstraps the plugin emits (SDD-19 §4.8). `main.ts` of SDD-16
 * left the SW lifecycle "out of scope, build concern" — it lives here. Each URL is a
 * JS expression (a `import.meta.ROLLUP_FILE_URL_<ref>` so Rollup fills the real hashed
 * URL, guaranteeing SW and WW load the SAME manifest).
 *
 * Who creates the render Web Worker: THE MAIN THREAD. A `ServiceWorkerGlobalScope`
 * exposes neither `Worker` (`ReferenceError: Worker is not defined`) nor `import()`
 * ("import() is disallowed on ServiceWorkerGlobalScope by the HTML specification",
 * w3c/ServiceWorker#1356) — both verified in Chrome. So the SW can neither spawn the
 * renderer nor load a chunk: the main thread creates the worker and transfers one end
 * of a `MessageChannel` to each side. From then on the SW talks to the WW directly,
 * with no main-thread hop. Until a port arrives (a cold navigation with no live client)
 * the SW does not intercept: the network answers, which is exactly right for a
 * prerendered route and a 404 for an incremental one.
 */

/** WW entry: wait for the port the main thread transfers, then serve renders on it. */
export function emitWwBootstrap(manifestUrlExpr: string): string {
  return `import { loadManifest, installRenderWorker, WORKER_PORT_MESSAGE } from '@fudic/transport';

const ready = loadManifest(${manifestUrlExpr});

self.addEventListener('message', (e) => {
  const port = e.ports[0];
  if (e.data && e.data.type === WORKER_PORT_MESSAGE && port) {
    ready.then((manifest) => installRenderWorker(manifest, port));
  }
});
`;
}

/** SW entry: the single cache hit/miss router + version-based cache purge (SDD-19 §4.9). */
export function emitSwBootstrap(manifestUrlExpr: string, cacheName: string): string {
  return `import { loadManifest, createRouter, controlBus, WORKER_PORT_MESSAGE } from '@fudic/transport';

const CACHE = ${JSON.stringify(cacheName)};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// The render Web Worker is created by the main thread; here we only receive its port.
let workerPort = null;
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === WORKER_PORT_MESSAGE && e.ports[0]) workerPort = e.ports[0];
});

let routerPromise;
function router() {
  if (!routerPromise) {
    routerPromise = (async () => {
      const manifest = await loadManifest(${manifestUrlExpr});
      const cache = await caches.open(CACHE);
      controlBus().on((msg) => {
        if (msg.type === 'purge' || msg.type === 'invalidate') cache.delete(msg.route);
        else if (msg.type === 'version') caches.delete(CACHE);
      });
      // Read through the live binding: a reload replaces the worker and its port.
      const worker = { postMessage: (message, transfer) => workerPort.postMessage(message, transfer) };
      return createRouter({ manifest, worker, cache });
    })();
  }
  return routerPromise;
}

self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  if (workerPort === null) return; // no renderer connected yet: let the network answer
  e.respondWith((async () => {
    const r = await router();
    let response;
    r.handle({ request: e.request, respondWith: (res) => { response = res; } });
    return response !== undefined ? await response : fetch(e.request);
  })());
});
`;
}

/** Main-thread entry: register the render Service Worker, then create and join the WW. */
export function emitMainBootstrap(swUrlExpr: string, wwUrlExpr: string): string {
  return `import { registerRenderServiceWorker, connectRenderWorker } from '@fudic/transport';

if ('serviceWorker' in navigator) {
  registerRenderServiceWorker(${swUrlExpr}).then(() => connectRenderWorker(${wwUrlExpr}));
}
`;
}
