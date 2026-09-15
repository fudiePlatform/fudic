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

// TEMPORARY (BUG-33 task 2). The real id comes from the project's \`fudic.json\` in task 4;
// until then the emitter carries one by hand so the worker it writes is coherent.
const APP = "fudic-app";
const BUILD = ${JSON.stringify(BUILD_TOKEN)};
const MANIFEST_URL = ${options.manifestUrlExpr};
const SHELL = ${JSON.stringify(options.shell)};
const RESOURCES = ${JSON.stringify(options.resources)};
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
   * Whether ANY component of the app injects or provides (SDD-38 §5).
   *
   * Off — the default — and the bootstrap does not so much as name `@fudic/di/page`, so the
   * bundle has no chunk for it and `dist` has no file for it either. «A route without
   * `inject` does not download a line of DI» is enforced by not writing the import.
   */
  readonly hasDi?: boolean;
  /**
   * The Service Worker's URL, as a JS expression — or `null` when the page has none: no
   * `sw.json`, or `pnpm dev` with `dev: 'off'`. **Hydration does not depend on it.**
   */
  readonly swUrlExpr: string | null;
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
export function emitBootBootstrap(swUrlExpr: string | null): string {
  if (swUrlExpr === null) return 'export {};\n';
  return [
    `import { registerRenderServiceWorker, notifyLocation } from '@fudic/transport';`,
    '',
    `if ('serviceWorker' in navigator) {`,
    `  registerRenderServiceWorker(${swUrlExpr}).then(() => notifyLocation());`,
    `}`,
    '',
  ].join('\n');
}

/**
 * Main thread: install the hydration runtime, on the pages that have something to hydrate.
 *
 * It used to also register the Service Worker, and that is now `emitBootBootstrap` above
 * (BUG-31 §T2) — the two are loaded by different tags because they are needed under
 * different conditions. What is preserved from SDD-17 §4.7.1 is the fact that made them one
 * module in the first place: hydration must NOT depend on there being a worker. It does not.
 * What still branches on the worker here is the warm channel, because the page that knows how
 * it was emitted is this one.
 */
export function emitMainBootstrap(options: MainBootstrapOptions): string {
  const { chunks, swUrlExpr } = options;
  const hasWorker = swUrlExpr !== null;
  // Only what this page actually uses: a dev page with no Service Worker imports nothing
  // from `@fudic/transport` at all.
  const transport: string[] = [];
  if (chunks.mode === 'build') transport.push('createUrlResolver');
  // The warm channel, chosen HERE and once (SDD-17 §4.7.1): the page that knows whether it
  // was emitted with a worker is this one, so the runtime carries no branch for it and the
  // unused channel is not even in the bundle.
  const channel = hasWorker ? 'createServiceWorkerWarmChannel' : 'createPreloadWarmChannel';
  const head = [
    `import { installHydration, ${channel} } from '@fudic/core';`,
    // Static, and written only when the app has DI at all (SDD-38 §5). A dynamic import
    // would be tidier on paper and is not worth it: an app with no DI does not emit this
    // line, so nothing of the injector reaches the bundle either way, and a static edge is
    // one the bundler cannot get wrong.
    ...(options.hasDi === true ? [`import { buildTree } from '@fudic/di/page';`] : []),
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
          `//`,
          `// ABSOLUTE, and that is the whole point of the \`new URL\`. Vite's dev import`,
          `// analysis rewrites every \`import(url)\` whose specifier is a runtime value into`,
          `// \`import(__vite__injectQuery(url, 'import'))\`, and that helper decorates a`,
          `// relative or root-relative path — and ONLY those. With a root-relative prefix the`,
          `// browser ends up asking for \`…js?import\` while the warm named \`…js\`: two URLs,`,
          `// two downloads, and a preload that never lands. An absolute URL is returned`,
          `// untouched, so the preload and the import are the same request again.`,
          `const CHUNKS = new URL(${JSON.stringify(chunks.urlPrefix)}, document.baseURI).href;`,
          `const resolveChunk = (tag) => CHUNKS + tag + '.js';`,
        ];
  // The registration lives in the boot entry now (BUG-31 §T2); what is left of `swUrlExpr`
  // here is the fact it stands for — whether this page was emitted with a worker — which is
  // what picks the warm channel above.
  // The container tree, rebuilt from the published map (SDD-38 §4.2). Both imports are
  // dynamic and both hang off the block existing, so a page with no DI fetches neither.
  //
  // It is STARTED here and handed to `installHydration` as `ready`, rather than awaited
  // before it. The runtime's capturer has to be listening from the first millisecond: a
  // click before it is installed is not deferred, it is lost, and this round trip is a
  // compile away in dev. So the capturer goes up first and path 2 waits for the tree — no
  // chunk resolves against a tree that is not built, and no gesture is dropped waiting.
  const ready = options.hasDi !== true ? '' : ', ready: $ioc';
  const di = options.hasDi !== true
    ? []
    : [
        '',
        'const $ioc = (async () => {',
        `  const $iocBlock = document.getElementById('fud-ioc');`,
        '  if ($iocBlock === null) return;',
        '  const [$nodes, $tags] = JSON.parse($iocBlock.textContent);',
        `  const $seedBlock = document.getElementById('fud-di');`,
        '  // One IoC module per OWNING tag, by URL — the same arithmetic a hydration chunk',
        '  // uses.',
        '  const $owners = [...new Set($tags.filter(Boolean))];',
        '  // `@vite-ignore` for the same reason the hydration loader carries one: the URL is',
        '  // a runtime value derived from the manifest, not a build-time edge.',
        `  const $mods = await Promise.all(`,
        `    $owners.map((tag) => import(/* @vite-ignore */ resolveChunk(tag + '.ioc'))),`,
        '  );',
        '  const $byTag = new Map($owners.map((tag, i) => [tag, $mods[i]]));',
        '  buildTree(',
        '    $nodes,',
        '    (node, container) => { const $m = $byTag.get($tags[node]); if ($m) $m.register(container); },',
        '    $seedBlock === null ? undefined : JSON.parse($seedBlock.textContent),',
        '  );',
        '})();',
      ];
  return [
    ...head,
    ...resolver,
    ...di,
    '',
    // The order does not matter: a warm ordered before the worker takes control is queued
    // and flushed on `controllerchange`, which is the only case there is on a first load.
    `installHydration({ root: document, resolveChunk, warm: ${channel}()${ready} });`,
    '',
  ].join('\n');
}
