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
  isStaleCache, controlBus, LOCATION_MESSAGE, WARM_MESSAGE, WARMED_MESSAGE,
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

// Two notices, and neither subsumes the other. The location is THE single route warm
// trigger (§4.6.2): the document says where the user is and the SW warms that template
// behind the navigation already in flight. The warm order is the page's (SDD-17 §4.7):
// the components the user can SEE, deposited before the first gesture and never evaluated.
self.addEventListener('message', (e) => {
  const msg = e.data;
  if (!msg) return;
  if (msg.type === LOCATION_MESSAGE) {
    e.waitUntil(boot().then((r) => r && r.warm(new URL(msg.url).pathname)));
  } else if (msg.type === WARM_MESSAGE) {
    e.waitUntil(boot().then(async (r) => {
      if (!r) return;
      // Only what really landed is confirmed: a page told a chunk is warm and then
      // paying network for it would be worse than never having been told.
      const landed = new Set(await r.warmUrls(msg.urls));
      if (!e.source) return;
      e.source.postMessage({
        type: WARMED_MESSAGE,
        urls: msg.urls.filter((url) => landed.has(url)),
        tags: msg.tags.filter((_, i) => landed.has(msg.urls[i])),
      });
    }));
  }
});

self.addEventListener('fetch', (e) => {
  if (router !== null) router.handle(e);
});
`;
}

/**
 * How the main thread turns a tag into the URL of its hydration chunk (SDD-17 §4.6).
 *
 * Two modes and no third, because there are exactly two ways a page can have been emitted.
 * In a BUILD the URL is DERIVED from the manifest's arithmetic — `hydrateUrl(tag)` —
 * which is why the build id has to travel inside this chunk. In DEV nothing is built:
 * the component's client module is served by the dev server at a stable per-tag URL, and
 * the build id does not exist.
 *
 * The choice is made here, at emit time, so the runtime never carries a branch for it.
 */
export type ChunkResolution =
  | { readonly mode: 'build'; readonly base: string }
  | { readonly mode: 'dev'; readonly urlPrefix: string };

export interface MainBootstrapOptions {
  readonly chunks: ChunkResolution;
  /**
   * The Service Worker's URL, as a JS expression — or `null` when the page has none: no
   * `sw.json`, or `pnpm dev` with `dev: 'off'`. **Hydration does not depend on it.**
   */
  readonly swUrlExpr: string | null;
}

/**
 * Main thread: install the hydration runtime — ALWAYS — and, when the page was emitted with
 * one, register the render Service Worker and tell it where the user is.
 *
 * The order of those two facts is the correction of SDD-17 §4.7.1. This module used to be
 * `export {};` whenever there was no Service Worker, which quietly made "no SW" mean "no
 * hydration" — and that is three quarters of the real cases: a project without `sw.json`,
 * `pnpm dev`, and every first load before `clients.claim()`. The runtime is ONE runtime; what
 * branches is the two ports injected here, because this is the only place that knows how the
 * page was emitted.
 */
export function emitMainBootstrap(options: MainBootstrapOptions): string {
  const { chunks, swUrlExpr } = options;
  const hasWorker = swUrlExpr !== null;
  // Only what this page actually uses: a dev page with no Service Worker imports nothing
  // from `@fudic/transport` at all.
  const transport: string[] = [];
  if (chunks.mode === 'build') transport.push('createUrlResolver');
  if (hasWorker) transport.push('registerRenderServiceWorker', 'notifyLocation');
  // The warm channel, chosen HERE and once (SDD-17 §4.7.1): the page that knows whether it
  // was emitted with a worker is this one, so the runtime carries no branch for it and the
  // unused channel is not even in the bundle.
  const channel = hasWorker ? 'createServiceWorkerWarmChannel' : 'createPreloadWarmChannel';
  const head = [
    `import { installHydration, ${channel} } from '@fudic/core';`,
    ...(transport.length === 0
      ? []
      : [`import { ${transport.join(', ')} } from '@fudic/transport';`]),
    '',
  ];
  const resolver =
    chunks.mode === 'build'
      ? [
          `// The build id travels inside this chunk, substituted like the Service Worker's`,
          `// (SDD-27 §5.2): the URL of a hydration chunk is DERIVED, never mapped.`,
          `const URLS = createUrlResolver(${JSON.stringify(chunks.base)}, ${JSON.stringify(BUILD_TOKEN)});`,
          `const resolveChunk = (tag) => URLS.hydrateUrl(tag);`,
        ]
      : [
          `// In dev nothing is built: the dev server publishes each component's client`,
          `// module at a stable URL per tag.`,
          `const CHUNKS = ${JSON.stringify(chunks.urlPrefix)};`,
          `const resolveChunk = (tag) => CHUNKS + tag + '.js';`,
        ];
  const worker = !hasWorker
    ? []
    : [
        '',
        `if ('serviceWorker' in navigator) {`,
        `  registerRenderServiceWorker(${swUrlExpr}).then(() => notifyLocation());`,
        `}`,
      ];
  return [
    ...head,
    ...resolver,
    '',
    // The order does not matter: a warm ordered before the worker takes control is queued
    // and flushed on `controllerchange`, which is the only case there is on a first load.
    `installHydration({ root: document, resolveChunk, warm: ${channel}() });`,
    ...worker,
    '',
  ].join('\n');
}
