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
  /**
   * The app id (SDD-41 §3.1), which namespaces this application's caches (BUG-33).
   *
   * A literal and not a token: it is known in `configResolved`, long before
   * `generateBundle`, unlike the build id. So `BUILD_TOKEN` stays the only substitution
   * made on the emitted code, and the map generated for it still describes it.
   *
   * It is never empty when a worker is emitted: a project with a `sw.json` and no `id` is
   * FUD0721 and the build fails (SDD-41 §4.3), so there is no degraded case to invent a
   * default for — one that would be the name three different apps collide under.
   */
  readonly app: string;
  /**
   * Where the published runtime lives on the origin — `/_fudic/` — and the cache that holds
   * it (SDD-45 §4.5.1). Both empty when this project links none.
   *
   * The name carries the framework VERSION and neither the app nor the build id, and that is
   * the whole of §4.9: it is the one cache two applications of an origin are meant to share,
   * and a deploy must not throw it away. Deliberately outside the `<kind>-<app>-<build>`
   * scheme BUG-33 introduced, and therefore outside its purge, which only knows those four.
   */
  readonly runtimePrefix: string;
  readonly runtimeCache: string;
}

/**
 * The Service Worker: install (shell only), activate (purge other builds), the single
 * warm trigger, and a fetch handler that is wired ONLY once the router is ready — so
 * the synchronous decision of §4.4.1 always has the manifest in memory.
 */
export function emitSwBootstrap(options: SwBootstrapOptions): string {
  return `import {
  loadManifest, createLinker, canLink, createRouter, createStore, cacheNames,
  isStaleCache, controlBus, LOCATION_MESSAGE, RUNTIME_MESSAGE, WARM_MESSAGE, WARMED_MESSAGE,
} from '@fudic/transport';
import * as ssr from '@fudic/ssr';

const APP = ${JSON.stringify(options.app)};
const BUILD = ${JSON.stringify(BUILD_TOKEN)};
const MANIFEST_URL = ${options.manifestUrlExpr};
const SHELL = ${JSON.stringify(options.shell)};
const RESOURCES = ${JSON.stringify(options.resources)};
// Where the published runtime lives on this origin, and the cache it goes in (SDD-45 §4.5.1,
// §4.9). Both empty for a project that links no published runtime, and then this worker
// behaves exactly as it did before there was one.
const RUNTIME_PREFIX = ${JSON.stringify(options.runtimePrefix)};
const RUNTIME_CACHE = ${JSON.stringify(options.runtimeCache)};
const NAMES = cacheNames(APP, BUILD);
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
  const cache = await caches.open(NAMES.shell);
  const shell = createStore({ cache });
  for (const url of PRECACHE) {
    try {
      const response = await fetch(url, { cache: 'reload' });
      if (response.ok) await shell.put(url, response);
    } catch { /* a missing shell entry must not fail install */ }
  }
  // The published runtime is NOT precached here, and that is a decision rather than an
  // omission (SDD-45 §4.5.1). Bringing every piece the application links at \`install\` was
  // the first answer: it made the first visit download the whole framework — forms,
  // injection, reactivity — to render a page that may use none of it, which is a monolith
  // arriving by another road. A progressive application downloads what the page in front of
  // the user needs; each piece is cached the first time some page asks for it, and from then
  // on it is a cache read. The framework ends up entirely cached when it has entirely been
  // needed, and not one request before.
  await self.skipWaiting();
})()));

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const name of await caches.keys()) {
    if (isStaleCache(name, APP, BUILD)) await caches.delete(name);
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
  const r = createRouter({
    table,
    linker,
    stores,
    resources: RESOURCES,
    shell: PRECACHE,
    // Everything under \`/_fudic/\` is served cache-first from a cache of its own and written
    // the first time a page asks for it (SDD-45 §4.5.1). Its name carries the framework
    // version and neither the app nor the build, which is what lets two applications of one
    // origin share it and what keeps a deploy from throwing it away.
    ...(RUNTIME_CACHE === '' ? {} : {
      runtime: { prefix: RUNTIME_PREFIX, store: createStore({ cache: await caches.open(RUNTIME_CACHE) }) },
    }),
  });
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
  } else if (msg.type === RUNTIME_MESSAGE) {
    // The pieces the page already used (SDD-45 §4.5.1), kept for the next visit. It is the
    // answer to the one load this worker could not see — its own first one, during which it
    // was still installing — and it is a read of the browser's HTTP cache, not a download.
    e.waitUntil(boot().then((r) => r && r.keepRuntime(msg.urls)));
  } else if (msg.type === WARM_MESSAGE) {
    e.waitUntil(boot().then(async (r) => {
      if (!r) return;
      // BY TAG: the page knows tags, and what a tag's chunk imports is in the manifest,
      // which is this side's to read. Only what really landed is confirmed — a page told a
      // chunk is warm and then paying network for it is worse than never having been told.
      const landed = new Set(await r.warmHydration(msg.tags));
      if (!e.source) return;
      e.source.postMessage({
        type: WARMED_MESSAGE,
        urls: msg.urls.filter((_, i) => landed.has(msg.tags[i])),
        tags: msg.tags.filter((tag) => landed.has(tag)),
      });
    }));
  }
});

self.addEventListener('fetch', (e) => {
  if (router !== null) { router.handle(e); return; }
  // A worker the browser just WOKE (BUG-31 §T7). The module has re-evaluated, so \`router\`
  // is null again and \`boot()\` has only just started — and the listener runs synchronously,
  // so the old guard let the navigation fall through to the network. Online that is
  // invisible; offline it is the whole app failing to open, and it is why Firefox — which
  // terminates workers far sooner than Chrome — only served from cache on the third try.
  //
  // Navigations only, and that is the boundary: a document is worth waiting a boot for, and
  // it is the request whose failure the user sees. A subresource of a page the network
  // served has to go to the same network, not to a cache this worker has not read yet.
  if (e.request.mode === 'navigate' && e.request.method === 'GET') {
    e.respondWith(boot().then((r) => (r === null ? fetch(e.request) : r.respond(e))));
  }
});
`;
}

/**
 * The always-on half of the main thread (BUG-31 §T2): register the render Service Worker and
 * tell it where the user is. Nothing else — and nothing of the hydration runtime.
 *
 * It is its own entry point because the two halves answer to different facts. fudic is
 * offline-first: the worker has to be registered on every page, including the one that is
 * pure HTML, or the first visit to a static route leaves the app with no worker at all. The
 * hydration runtime answers to whether THIS page has anything to hydrate, and on a page that
 * has nothing it used to be 10 kB across six requests that walked the DOM, found no
 * `data-fud-id` and stopped.
 *
 * Emitted as `export {};` when the page has no Service Worker (no `sw.json`, or `dev: 'off'`):
 * the tag is still in the head, and what it loads is empty. That is the one shape that keeps
 * the layout's markup independent of a decision taken in `sw.json`.
 */
export function emitBootBootstrap(swUrlExpr: string | null, runtimePrefix = ''): string {
  if (swUrlExpr === null) return 'export {};\n';
  return [
    `import { registerRenderServiceWorker, notifyLocation${
      runtimePrefix === '' ? '' : ', notifyRuntimeUsed'
    } } from '@fudic/transport';`,
    '',
    `if ('serviceWorker' in navigator) {`,
    `  registerRenderServiceWorker(${swUrlExpr}).then(() => notifyLocation());`,
    `}`,
    ...(runtimePrefix === ''
      ? []
      : [
          '',
          `// What this page used of the published runtime, told to the worker AFTER the load`,
          `// (SDD-45 §4.5.1). On a first visit the worker was still installing while all of`,
          `// this went past it, so without the notice the runtime is only cached on the second`,
          `// visit — which is then the first one that can work offline. Reported and not`,
          `// precached: these files are already in the browser, and the worker just keeps them.`,
          `if ('serviceWorker' in navigator) {`,
          `  const report = () => { void notifyRuntimeUsed(${JSON.stringify(runtimePrefix)}); };`,
          `  if (document.readyState === 'complete') report();`,
          `  else addEventListener('load', report, { once: true });`,
          `}`,
        ]),
    '',
  ].join('\n');
}
