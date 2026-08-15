/**
 * SDD-20 §4.4/§4.6/§4.10: the two bootstraps. There is no Web Worker one any more —
 * a WW cannot render during a navigation, which is the whole point of SDD-20.
 */

import { describe, it, expect } from 'vitest';
import { emitSwBootstrap, emitMainBootstrap } from '../src/bootstrap.js';
import { BUILD_TOKEN } from '../src/constants.js';

describe('emitSwBootstrap', () => {
  const code = emitSwBootstrap({
    manifestUrlExpr: '"/fudic-routes.json"',
    shell: ['/style.css'],
    resources: [{ pattern: '/api/**', policy: 'network-first', ttl: 300_000 }],
  });

  it('renders in the Service Worker itself: linker, stores and router', () => {
    expect(code).toContain('createLinker');
    expect(code).toContain('createRouter({ table, linker, stores, resources: RESOURCES');
    expect(code).toContain("addEventListener('fetch'");
  });

  it('BUG-01 §6.7 hands the router exactly what install precached, manifest included', () => {
    // The shell cache is opened once and used for BOTH: reading the manifest and
    // serving. Without the store there is no reader, and the precache is decoration.
    expect(code).toContain('shell: createStore({ cache: shell })');
    expect(code).toContain('shell: PRECACHE');
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
    expect(install).toContain('createStore({ cache: await caches.open(NAMES.shell) })');
    expect(install).toContain('shell.put(url, response)');
    // A fixed unhashed name plus a long max-age would let a new build precache the OLD
    // bytes, and cache-first with no TTL would serve them forever.
    expect(install).toContain("fetch(url, { cache: 'reload' })");
    // The safety net stays: a missing entry is a build diagnostic (FUD0391), not a crash.
    expect(install).toContain('catch');
  });

  it('does not intercept until the router is ready (the decision is synchronous)', () => {
    expect(code).toContain('if (router !== null) router.handle(e);');
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

  it('names every cache with the build id and purges the others on activate', () => {
    expect(code).toContain(`const BUILD = "${BUILD_TOKEN}";`);
    expect(code).toContain('cacheNames(BUILD)');
    expect(code).toContain('isStaleCache(name, BUILD)');
  });

  it('wires the control channel to invalidation and version purges', () => {
    expect(code).toContain('controlBus().on(');
    expect(code).toContain('linker.reset()');
    expect(code).toContain('r.invalidate(msg.route)');
  });
});

describe('emitMainBootstrap', () => {
  it('registers the Service Worker and tells it where the user is', () => {
    const code = emitMainBootstrap({
      chunks: { mode: 'build', base: '/' },
      swUrlExpr: 'import.meta.ROLLUP_FILE_URL_sw',
    });
    expect(code).toContain(
      "import { createUrlResolver, registerRenderServiceWorker, notifyLocation } from '@fudic/transport';",
    );
    expect(code).toContain("'serviceWorker' in navigator");
    expect(code).toContain('registerRenderServiceWorker(import.meta.ROLLUP_FILE_URL_sw)');
    expect(code).toContain('notifyLocation()');
    expect(code).not.toContain('new Worker'); // the WW is gone for good
  });

  it('SDD-17 §4.7.1 installs the hydration ALWAYS — the Service Worker is what is optional', () => {
    const withWorker = emitMainBootstrap({
      chunks: { mode: 'build', base: '/' },
      swUrlExpr: '"/fudic-sw.js"',
    });
    const without = emitMainBootstrap({ chunks: { mode: 'build', base: '/' }, swUrlExpr: null });

    for (const code of [withWorker, without]) {
      expect(code).toContain('installHydration({ root: document, resolveChunk, warm:');
    }
    // What used to be an `export {};` — and therefore no hydration at all — for three
    // quarters of the real cases: no `sw.json`, `pnpm dev`, an uncontrolled first load.
    expect(without).not.toContain('serviceWorker');
    expect(without).not.toContain('registerRenderServiceWorker');
  });

  it('in a build the chunk URL is derived, with the build id substituted like the worker’s', () => {
    const code = emitMainBootstrap({ chunks: { mode: 'build', base: '/app/' }, swUrlExpr: null });
    expect(code).toContain(`createUrlResolver("/app/", "${BUILD_TOKEN}")`);
    expect(code).toContain('const resolveChunk = (tag) => URLS.hydrateUrl(tag);');
    // No map from tag to URL, here or anywhere (SDD-17 §4.6).
    expect(code).not.toContain('fud-chunks');
  });

  it('SDD-17 §4.7.1 picks the warm channel here, once, and ships only that one', () => {
    const withWorker = emitMainBootstrap({
      chunks: { mode: 'build', base: '/' },
      swUrlExpr: '"/fudic-sw.js"',
    });
    const without = emitMainBootstrap({
      chunks: { mode: 'dev', urlPrefix: '/@fudic/h/' },
      swUrlExpr: null,
    });

    expect(withWorker).toContain(
      "import { installHydration, createServiceWorkerWarmChannel } from '@fudic/core';",
    );
    expect(withWorker).toContain('warm: createServiceWorkerWarmChannel()');
    expect(withWorker).not.toContain('createPreloadWarmChannel');

    // No worker — no `sw.json`, `pnpm dev`, an insecure context — and the page still warms:
    // `modulepreload` fetches and parses without evaluating, so the invariant holds.
    expect(without).toContain(
      "import { installHydration, createPreloadWarmChannel } from '@fudic/core';",
    );
    expect(without).toContain('warm: createPreloadWarmChannel()');
    expect(without).not.toContain('createServiceWorkerWarmChannel');
  });

  it('in dev it is the dev server’s per-tag URL, and no build id exists at all', () => {
    const code = emitMainBootstrap({
      chunks: { mode: 'dev', urlPrefix: '/@fudic/h/' },
      swUrlExpr: null,
    });
    // Absolute: Vite's dev import analysis decorates a root-relative dynamic specifier with
    // `?import` and leaves an absolute URL alone, so this is what keeps the URL the warm
    // preloads and the URL the import asks for one and the same (SDD-17 §4.7.1).
    expect(code).toContain('const CHUNKS = new URL("/@fudic/h/", document.baseURI).href;');
    expect(code).toContain("const resolveChunk = (tag) => CHUNKS + tag + '.js';");
    expect(code).not.toContain(BUILD_TOKEN);
    // A dev page with no worker needs nothing from the transport package.
    expect(code).not.toContain('@fudic/transport');
  });
});
