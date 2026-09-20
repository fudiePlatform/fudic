/**
 * The coordinator (SDD-45 §4.4): one module per route, naming the pieces that route needs.
 *
 * These are the assertions that used to live on `emitMainBootstrap` — the app-wide bootstrap
 * the coordinator replaced — moved here rather than deleted, because what they check is not
 * about that function: it is that the startup installs hydration whatever the Service Worker
 * does, that it picks ONE warm channel and ships only that one, that a build derives the
 * chunk URL and a dev does not, and that the injector is not so much as named by a route that
 * does not inject. Four properties, the same four, now owned by this generator.
 */

import { describe, expect, it } from 'vitest';

import { coordinatorFor, type CoordinatorParams } from '../src/coordinator.js';
import { BUILD_TOKEN } from '../src/constants.js';

/**
 * The pieces as DEV names them: package specifiers and the names the source exports, which is
 * what §4.15 says the coordinator uses where nothing is published.
 */
const devPieces = (hasWorker: boolean): CoordinatorParams['pieces'] => ({
  hydrate: { from: '@fudic/core', name: 'installHydration' },
  warm: hasWorker
    ? { from: '@fudic/core', name: 'createServiceWorkerWarmChannel' }
    : { from: '@fudic/core', name: 'createPreloadWarmChannel' },
  di: { from: '@fudic/di/page', name: 'installPage' },
  urls: { from: '@fudic/transport', name: 'createUrlResolver' },
});

const built = (opts: { base?: string; hasWorker?: boolean; injects?: boolean } = {}): string => {
  const coordinator = coordinatorFor(
    { hydrates: true, injects: opts.injects ?? false },
    {
      chunks: { mode: 'build', base: opts.base ?? '/' },
      pieces: devPieces(opts.hasWorker ?? false),
    },
  );
  return coordinator?.source ?? '';
};

const inDev = (opts: { hasWorker?: boolean; injects?: boolean } = {}): string => {
  const coordinator = coordinatorFor(
    { hydrates: true, injects: opts.injects ?? false },
    { chunks: { mode: 'dev', urlPrefix: '/@fudic/h/' }, pieces: devPieces(opts.hasWorker ?? false) },
  );
  return coordinator?.source ?? '';
};

describe('the coordinator', () => {
  it('no longer registers the worker: that half moved out (BUG-31 T2)', () => {
    const code = built({ hasWorker: true });
    expect(code).not.toContain('registerRenderServiceWorker');
    expect(code).not.toContain('notifyLocation');
    expect(code).not.toContain('new Worker'); // the WW is gone for good
    // What it still reads from the worker is the warm channel, and only that: the page that
    // knows how it was emitted is this one.
    expect(code).toContain(
      'import { installHydration as $hydrate, createServiceWorkerWarmChannel as $warm } from "@fudic/core";',
    );
  });

  it('SDD-17 §4.7.1 installs the hydration ALWAYS — the Service Worker is what is optional', () => {
    for (const code of [built({ hasWorker: true }), built({ hasWorker: false })]) {
      expect(code).toContain('$hydrate({');
      expect(code).toContain('root: document,');
      expect(code).toContain('resolveChunk: $chunk,');
    }
    // What used to be an `export {};` — and therefore no hydration at all — for three
    // quarters of the real cases: no `sw.json`, `pnpm dev`, an uncontrolled first load.
    const without = built({ hasWorker: false });
    expect(without).not.toContain('serviceWorker');
    expect(without).not.toContain('registerRenderServiceWorker');
  });

  it('in a build the chunk URL is derived, with the build id substituted like the worker’s', () => {
    const code = built({ base: '/app/' });
    expect(code).toContain(`$resolver("/app/", "${BUILD_TOKEN}")`);
    expect(code).toContain('const $chunk = (tag) => $urls.hydrateUrl(tag);');
    // No map from tag to URL, here or anywhere (SDD-17 §4.6).
    expect(code).not.toContain('fud-chunks');
  });

  it('SDD-17 §4.7.1 picks the warm channel here, once, and ships only that one', () => {
    const withWorker = built({ hasWorker: true });
    const without = inDev({ hasWorker: false });

    expect(withWorker).toContain('createServiceWorkerWarmChannel as $warm');
    expect(withWorker).toContain('warm: $warm(),');
    expect(withWorker).not.toContain('createPreloadWarmChannel');

    // No worker — no `sw.json`, `pnpm dev`, an insecure context — and the page still warms:
    // `modulepreload` fetches and parses without evaluating, so the invariant holds.
    expect(without).toContain('createPreloadWarmChannel as $warm');
    expect(without).toContain('warm: $warm(),');
    expect(without).not.toContain('createServiceWorkerWarmChannel');
  });

  it('in dev it is the dev server’s per-tag URL, and no build id exists at all', () => {
    const code = inDev();
    // Absolute: Vite's dev import analysis decorates a root-relative dynamic specifier with
    // `?import` and leaves an absolute URL alone, so this is what keeps the URL the warm
    // preloads and the URL the import asks for one and the same (SDD-17 §4.7.1).
    expect(code).toContain('const $prefix = new URL("/@fudic/h/", document.baseURI).href;');
    expect(code).toContain("const $chunk = (tag) => $prefix + tag + '.js';");
    expect(code).not.toContain(BUILD_TOKEN);
    // A dev page with no worker needs nothing from the transport package.
    expect(code).not.toContain('@fudic/transport');
  });

  it('rebuilds the container tree from the published map, before hydration installs', () => {
    const code = built({ injects: true });

    expect(code).toContain('import { installPage as $di } from "@fudic/di/page";');
    expect(code).toContain(`document.getElementById('fud-ioc')`);
    expect(code).toContain(`document.getElementById('fud-di')`);
    // STARTED before the runtime installs and handed to it as `ready`, not awaited in front
    // of it. The capturer has to be listening from the first millisecond — a click before it
    // is installed is lost, not deferred — and path 2 is where the tree is waited for, which
    // is the last moment at which a chunk could resolve against one that is not built.
    expect(code.indexOf('const $tree =')).toBeLessThan(code.indexOf('$hydrate({'));
    expect(code).toContain('ready: $tree,');
    expect(code).not.toMatch(/^await /mu);
  });

  it('does not so much as name the injector when the route does not inject', () => {
    const code = built({ injects: false });

    expect(code).not.toContain('@fudic/di');
    expect(code).not.toContain('fud-ioc');
    expect(code).not.toContain('$di');
  });

  it('a route with nothing to hydrate has no coordinator: no file and no tag', () => {
    expect(
      coordinatorFor(
        { hydrates: false, injects: false },
        { chunks: { mode: 'build', base: '/' }, pieces: devPieces(false) },
      ),
    ).toBeNull();
  });

  it('is named by its content: the same needs produce the same file', () => {
    const params: CoordinatorParams = {
      chunks: { mode: 'build', base: '/' },
      pieces: devPieces(true),
    };
    const one = coordinatorFor({ hydrates: true, injects: false }, params);
    const same = coordinatorFor({ hydrates: true, injects: false }, params);
    const other = coordinatorFor({ hydrates: true, injects: true }, params);

    expect(one?.name).toBe(same?.name);
    expect(one?.name).not.toBe(other?.name);
  });
});
