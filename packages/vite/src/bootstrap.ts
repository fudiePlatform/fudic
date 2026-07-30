/**
 * The two bootstraps the plugin emits (SDD-20 §4.4, §4.6). There used to be three: the
 * Web Worker one is gone, because a WW cannot render during a navigation — it dies with
 * its document and the stream never closes (measured in Chromium 151 and WebKit 26.5).
 *
 * The Service Worker is now the renderer. It cannot `import()` (forbidden in
 * `ServiceWorkerGlobalScope`) so it links chunks with `new Function`, which is why
 * `/fudic-sw.js` — and only it — is served with `'unsafe-eval'`.
 */

import { BUILD_TOKEN } from './constants.js';

export interface SwBootstrapOptions {
  /** A JS expression evaluating to the manifest URL. */
  readonly manifestUrlExpr: string;
  /** What `install` precaches. The manifest adds itself: the SW needs it to work. */
  readonly shell: readonly string[];
  /** `sw.json` resource classes, in evaluation order. */
  readonly resources: unknown;
}

/**
 * The Service Worker: install (shell only), activate (purge other builds), the single
 * warm trigger, and a fetch handler that is wired ONLY once the router is ready — so
 * the synchronous decision of §4.4.1 always has the manifest in memory.
 */
export function emitSwBootstrap(options: SwBootstrapOptions): string {
  return `import {
  loadManifest, createLinker, canLink, createRouter, createStore, cacheNames,
  isStaleCache, controlBus, LOCATION_MESSAGE,
} from '@fudic/transport';
import * as ssr from '@fudic/ssr';

const BUILD = ${JSON.stringify(BUILD_TOKEN)};
const MANIFEST_URL = ${options.manifestUrlExpr};
const SHELL = ${JSON.stringify(options.shell)};
const RESOURCES = ${JSON.stringify(options.resources)};
const NAMES = cacheNames(BUILD);
// ONE list, absolute, for the two things that must never drift: what install writes and
// what the router will serve by identity. A Store key is an absolute URL (BUG-04 §3.1).
const PRECACHE = [...SHELL, MANIFEST_URL].map((url) => new URL(url, self.location.href).href);

self.addEventListener('install', (e) => e.waitUntil((async () => {
  // The install precaches the SHELL and nothing else. Not one route chunk: with 100
  // routes, precaching them all is unacceptable (SDD-20 §4.6.1).
  //
  // It writes through the STORE — not straight into the Cache — for two reasons
  // (BUG-04 §4.5). The key is then the canonical URL and the entry is sealed like every
  // other, so the shell stops being the one cache the Store did not write. And
  // \`cache: 'reload'\` skips the browser's HTTP cache: the shell has fixed unhashed names,
  // so a host with a long max-age would otherwise let a new build precache the OLD bytes
  // — served forever, since the policy is cache-first with no TTL.
  const shell = createStore({ cache: await caches.open(NAMES.shell) });
  for (const url of PRECACHE) {
    try {
      const response = await fetch(url, { cache: 'reload' });
      if (response.ok) await shell.put(url, response);
    } catch { /* a missing shell entry must not fail install */ }
  }
  await self.skipWaiting();
})()));

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const name of await caches.keys()) {
    if (isStaleCache(name, BUILD)) await caches.delete(name);
  }
  await self.clients.claim();
  await boot(); // the shell is in place now: this is the attempt that succeeds on a first install
})()));

// Everything needed to DECIDE lives in memory; the SW rehydrates from its own cache,
// without network, and until it is ready it does not intercept at all.
let router = null;
let booting = null;

function boot() {
  if (booting === null) {
    booting = build().catch(() => {
      // On the very first start the shell cache is still empty (install has not run
      // yet), so this legitimately fails once: forget it and let activate retry.
      booting = null;
      return null;
    });
  }
  return booting;
}

async function build() {
  // Safety valve: a realm that cannot evaluate declares itself useless instead of
  // breaking the app — every navigation then falls through to the server.
  if (!canLink()) return null;
  const shell = await caches.open(NAMES.shell);
  const table = await loadManifest(MANIFEST_URL, shell);
  const stores = {
    // What install precached is ALSO what fetch serves: a write-only cache is a bug by
    // construction, and \`shell-<build>\` was one (BUG-01).
    shell: createStore({ cache: shell }),
    routes: createStore({ cache: await caches.open(NAMES.routes) }),
    pages: createStore({ cache: await caches.open(NAMES.pages) }),
    data: createStore({ cache: await caches.open(NAMES.data) }),
  };
  const linker = createLinker({
    fetchSource: (url) => stores.routes.get(url, 'cache-first', null).then((r) => r.text()),
    // The runtime is bundled INTO this worker and handed to chunks as a builtin: it
    // would otherwise be downloaded and evaluated again per chunk.
    builtins: { '@fudic/ssr': ssr },
  });
  // The router is handed exactly the URLs install put in the cache — the manifest
  // included: what is precached is served, and served BY IDENTITY (BUG-01 §4.1, §4.3).
  const r = createRouter({ table, linker, stores, resources: RESOURCES, shell: PRECACHE });
  await r.ready();
  controlBus().on((msg) => {
    if (msg.type === 'version') { linker.reset(); caches.delete(NAMES.pages); }
    else r.invalidate(msg.route);
  });
  router = r;
  return r;
}

// A restart after a recycle: the caches are already there, so this one succeeds and
// the SW is ready before the first navigation it could serve.
void boot();

// THE single warm trigger (§4.6.2): the document says where the user is, and the SW
// warms that template behind the navigation already in flight.
self.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== LOCATION_MESSAGE) return;
  e.waitUntil(boot().then((r) => r && r.warm(new URL(e.data.url).pathname)));
});

self.addEventListener('fetch', (e) => {
  if (router !== null) router.handle(e);
});
`;
}

/** Main thread: register the Service Worker, then tell it where the user is. */
export function emitMainBootstrap(swUrlExpr: string): string {
  return `import { registerRenderServiceWorker, notifyLocation } from '@fudic/transport';

if ('serviceWorker' in navigator) {
  registerRenderServiceWorker(${swUrlExpr}).then(() => notifyLocation());
}
`;
}
