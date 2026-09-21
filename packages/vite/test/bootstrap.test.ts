/**
 * SDD-20 §4.4/§4.6/§4.10: the two bootstraps. There is no Web Worker one any more —
 * a WW cannot render during a navigation, which is the whole point of SDD-20.
 */

import { describe, it, expect } from 'vitest';
import { emitSwBootstrap, emitBootBootstrap } from '../src/bootstrap.js';
import { BUILD_TOKEN } from '../src/constants.js';

describe('emitSwBootstrap', () => {
  const code = emitSwBootstrap({
    manifestUrlExpr: '"/fudic-routes.json"',
    shell: ['/style.css'],
    resources: [{ pattern: '/api/**', policy: 'network-first', ttl: 300_000 }],
    app: 'shop',
  });

  it('renders in the Service Worker itself: linker, stores and router', () => {
    expect(code).toContain('createLinker');
    expect(code).toContain('createRouter({');
    expect(code).toContain('resources: RESOURCES,');
    expect(code).toContain("addEventListener('fetch'");
  });

  it('BUG-01 §6.7 hands the router exactly what install precached, manifest included', () => {
    // The shell cache is opened once and used for BOTH: reading the manifest and
    // serving. Without the store there is no reader, and the precache is decoration.
    expect(code).toContain('shell: createStore({ cache: shell })');
    // The precached list is what the router is handed — plus the published pieces the
    // install also wrote (SDD-45 §4.5.1), which are precached for the same reason and would
    // be a write-only cache without this.
    expect(code).toContain('shell: [...PRECACHE, ...table.runtime()');
    // The very list the install loop iterates: the two cannot drift.
    const install = code.slice(code.indexOf("addEventListener('install'"), code.indexOf("addEventListener('activate'"));
    expect(install).toContain('for (const url of PRECACHE)');
  });

  it('never constructs a Worker or a MessageChannel: nothing streams between threads', () => {
    expect(code).not.toContain('new Worker');
    expect(code).not.toContain('new MessageChannel');
  });

  it('bundles the runtime as a linker builtin instead of shipping it per chunk', () => {
    expect(code).toContain("import * as ssr from '@fudic/ssr';");
    expect(code).toContain("builtins: { '@fudic/ssr': ssr }");
  });

  it('precaches the shell and the manifest, and nothing else', () => {
    expect(code).toContain('const SHELL = ["/style.css"];');
    // ONE list, absolute, shared by the install and the router: they cannot drift.
    expect(code).toContain('const PRECACHE = [...SHELL, MANIFEST_URL].map(');
    expect(code).toContain('new URL(url, self.location.href).href');
    // Not one route chunk is fetched at install time: warming is a separate trigger.
    const install = code.slice(code.indexOf("addEventListener('install'"), code.indexOf("addEventListener('activate'"));
    expect(install).toContain('for (const url of PRECACHE)');
    expect(install).not.toContain('warm');
  });

  it('BUG-04 §6.11 the install writes through the Store, and bypasses the HTTP cache', () => {
    const install = code.slice(code.indexOf("addEventListener('install'"), code.indexOf("addEventListener('activate'"));
    // `cache.add` is what wrote an entry the page's own request could not match.
    expect(install).not.toContain('cache.add');
    expect(install).toContain('await caches.open(NAMES.shell)');
    expect(install).toContain('createStore({ cache })');
    expect(install).toContain('shell.put(url, response)');
    // A fixed unhashed name plus a long max-age would let a new build precache the OLD
    // bytes, and cache-first with no TTL would serve them forever.
    expect(install).toContain("fetch(url, { cache: 'reload' })");
    // The safety net stays: a missing entry is a build diagnostic (FUD0391), not a crash.
    expect(install).toContain('catch');
  });

  it('serves from the router the moment it is ready (the decision is synchronous)', () => {
    expect(code).toContain('if (router !== null) { router.handle(e); return; }');
  });

  it('a woken worker TAKES the navigation and waits for its own boot (BUG-31 T7)', () => {
    // The listener is synchronous, so a worker the browser just woke — `router` null again,
    // `boot()` only just started — used to let the navigation fall through to the network.
    // Online that is invisible; offline it is the whole app failing to open.
    expect(code).toContain("if (e.request.mode === 'navigate' && e.request.method === 'GET') {");
    expect(code).toContain('e.respondWith(boot().then((r) => (r === null ? fetch(e.request) : r.respond(e))));');
  });

  it('checks the safety valve before anything else', () => {
    expect(code).toContain('if (!canLink()) return null;');
  });

  it('retries the boot after activate: on a first install the shell is not there yet', () => {
    // The router reads the manifest from the SHELL CACHE, which `install` fills. At
    // module-evaluation time on a brand-new registration that cache is still empty, so
    // the first attempt legitimately fails and `activate` is the one that succeeds.
    expect(code).toContain('booting = null;');
    expect(code.slice(code.indexOf("addEventListener('activate'"))).toContain('await boot();');
    expect(code).toContain('void boot();');
  });

  it('has exactly one ROUTE warm trigger: the location notice, never activate', () => {
    expect(code).toContain('LOCATION_MESSAGE');
    expect(code).toContain('r.warm(new URL(msg.url).pathname)');
    expect(code.slice(code.indexOf("addEventListener('activate'"), code.indexOf('let router'))).not.toContain(
      'warm',
    );
  });

  it('SDD-17 §4.7 warms the tags the page asks for, and confirms what landed', () => {
    expect(code).toContain('WARM_MESSAGE');
    // BY TAG: what a tag's chunk imports is in the manifest, which is this side's to read.
    expect(code).toContain('await r.warmHydration(msg.tags)');
    // Only what is really in the cache is confirmed: `fud:warmed` for a chunk that then
    // pays network would be worse than no warm at all.
    expect(code).toContain('const landed = new Set(');
    expect(code).toContain('type: WARMED_MESSAGE');
    expect(code).toContain('tags: msg.tags.filter((tag) => landed.has(tag))');
    // The reply goes to the client that ordered it, not broadcast to every page.
    expect(code).toContain('e.source.postMessage(');
  });

  it('names every cache with the app and the build, and purges only its own', () => {
    expect(code).toContain(`const BUILD = "${BUILD_TOKEN}";`);
    expect(code).toContain('cacheNames(APP, BUILD)');
    // Both constants, or a worker could purge a cache it never wrote (BUG-33).
    expect(code).toContain('isStaleCache(name, APP, BUILD)');
  });

  it('wires the control channel to invalidation and version purges', () => {
    expect(code).toContain('controlBus().on(');
    expect(code).toContain('linker.reset()');
    expect(code).toContain('r.invalidate(msg.route)');
  });
});

describe('emitBootBootstrap — the always-on half (BUG-31 T2)', () => {
  it('registers the Service Worker and tells it where the user is', () => {
    const code = emitBootBootstrap('import.meta.ROLLUP_FILE_URL_sw');
    expect(code).toContain(
      "import { registerRenderServiceWorker, notifyLocation } from '@fudic/transport';",
    );
    expect(code).toContain("'serviceWorker' in navigator");
    expect(code).toContain('registerRenderServiceWorker(import.meta.ROLLUP_FILE_URL_sw)');
    expect(code).toContain('notifyLocation()');
    expect(code).not.toContain('new Worker'); // the WW is gone for good
    // The registration and the hydration runtime are different tags now: this half carries
    // nothing of the second, so a page that hydrates nothing still gets its worker.
    expect(code).not.toContain('installHydration');
  });

  it('is an empty module when the page has no worker, so the tag can stay in the head', () => {
    // `export {};` and not an absent file: the layout's markup must not depend on a decision
    // taken in `sw.json`.
    expect(emitBootBootstrap(null)).toBe('export {};\n');
  });
});

// The `emitMainBootstrap` block moved to `coordinator.test.ts`: SDD-45 §4.4 replaced the
// app-wide bootstrap with one coordinator per route, and the four properties it checked —
// hydration always installed, one warm channel, the derived chunk URL, dev without a build
// id — are that generator's now.
