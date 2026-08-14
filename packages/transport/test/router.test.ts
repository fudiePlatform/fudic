/**
 * SDD-20 §6.13–§6.18: the one synchronous decision, the render, the nonce, and the
 * rules that exist because the prototype broke them (duplicate document request,
 * missing CSP, retrying a dead route on every navigation).
 */

import { describe, expect, it, vi } from 'vitest';
import { compileManifest, type ManifestFile } from '../src/manifest.js';
import { createLinker } from '../src/linker.js';
import { createStore, type Store } from '../src/store.js';
import { createRouter, type Router, type RouterStores } from '../src/router.js';
import { DEFAULT_CSP, NONCE_TOKEN } from '../src/csp.js';
import { countingCache, fakeCache, fetchEvent, readAll } from './helpers.js';

const ORIGIN = 'https://app.test/';

/** The chunk the linker will evaluate: a real `exports`/`require` module text. */
const CHUNK_SOURCE = `
const { html } = require('@fudic/ssr');
exports.render = function (ctx) {
  return html('<!DOCTYPE html><p nonce="' + ctx.nonce + '">' + ctx.params.slug + ':' + ctx.data.n + '</p>');
};
`;

/** The prerendered route's chunk: it reports the context it was rendered with. */
const ABOUT_SOURCE = `
const { html } = require('@fudic/ssr');
exports.render = function (ctx) {
  return html('<!DOCTYPE html><p nonce="' + ctx.nonce + '">' + ctx.origin + ':' + ctx.mode + '</p>');
};
`;

const FILE: ManifestFile = {
  build: 'b1',
  base: '/',
  csp: DEFAULT_CSP,
  routes: [
    // Prerendered at build time. For the Service Worker that is a fact about the BUILD:
    // at runtime it renders like any other route (BUG-02 §3.2).
    { pattern: '/about', mode: 'ssg', deps: [] },
    {
      pattern: '/blog/:slug',
      mode: 'sw',
      deps: ['dep'],
      dataPolicy: { policy: 'cache-first', ttl: null },
    },
    // A route whose chunk never made it into the build (FUD0399): only the server can
    // serve it, and asking for what it HAS is what keeps that from throwing (§6.8).
    { pattern: '/orphan', mode: 'ssg' },
    { pattern: '/account', mode: 'ssr' },
  ],
};

function harness(): {
  readonly stores: RouterStores;
  readonly network: string[];
  readonly sources: Map<string, string>;
  readonly data: Map<string, string>;
  readonly net: (request: Request) => Promise<Response>;
  readonly store: (kind: 'shell' | 'routes' | 'pages' | 'data') => Store;
} {
  const network: string[] = [];
  const sources = new Map<string, string>([
    [`${ORIGIN}sw/c/blog-slug-b1.js`, CHUNK_SOURCE],
    [`${ORIGIN}sw/c/dep-b1.js`, 'exports.v = 1;'],
    [`${ORIGIN}sw/c/about-b1.js`, ABOUT_SOURCE],
  ]);
  const data = new Map<string, string>([[`${ORIGIN}_fudic/data/blog/x`, '{"n":42}']]);

  const net = async (request: Request): Promise<Response> => {
    network.push(request.url);
    const source = sources.get(request.url) ?? data.get(request.url);
    if (source !== undefined) {
      return new Response(source);
    }
    if (request.url.endsWith('/about/index.html')) {
      return new Response(`<html><script nonce="${NONCE_TOKEN}"></script></html>`);
    }
    return new Response('not found', { status: 404 });
  };

  const make = (): Store => createStore({ cache: fakeCache().cache, net });
  const stores: RouterStores = { shell: make(), routes: make(), pages: make(), data: make() };
  return { stores, network, sources, data, net, store: (kind) => stores[kind] };
}

/** The linker the SW uses: sources come from `routes`, `@fudic/ssr` is a builtin. */
function linkerOver(routes: Store): ReturnType<typeof createLinker> {
  return createLinker({
    fetchSource: async (url) => (await routes.get(url, 'cache-first', null)).text(),
    builtins: {
      '@fudic/ssr': {
        html: (text: string): ReadableStream<Uint8Array> =>
          new ReadableStream({
            start(controller): void {
              controller.enqueue(new TextEncoder().encode(text));
              controller.close();
            },
          }),
      },
    },
  });
}

/** Let the `void`-ed cache writes of `render` land before asserting on the store. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** The same table, with `/blog/:slug` asking for its render to be persisted. */
function persistRouter(h: ReturnType<typeof harness>, extra: Record<string, unknown> = {}): Router {
  const persisted: ManifestFile = {
    ...FILE,
    routes: FILE.routes.map((route) =>
      route.pattern === '/blog/:slug'
        ? { ...route, page: { cache: 'persist' as const, ttl: null } }
        : route,
    ),
  };
  return createRouter({
    table: compileManifest(persisted),
    linker: linkerOver(h.stores.routes),
    stores: h.stores,
    origin: ORIGIN,
    net: h.net,
    nonce: () => 'n',
    ...extra,
  });
}

function router(h: ReturnType<typeof harness>, extra: Record<string, unknown> = {}) {
  return createRouter({
    table: compileManifest(FILE),
    linker: linkerOver(h.stores.routes),
    stores: h.stores,
    origin: ORIGIN,
    net: h.net,
    nonce: (() => {
      let n = 0;
      return (): string => `nonce${(n += 1)}`;
    })(),
    ...extra,
  });
}

describe('createRouter.handle — the synchronous decision', () => {
  it('§6.13 does not touch a non-navigation request with no resource rule', () => {
    const h = harness();
    const r = router(h);
    const event = fetchEvent(`${ORIGIN}img/a.png`, { mode: 'no-cors' });
    r.handle(event);
    expect(event.responded).toBeNull();
  });

  it('§6.13 never intercepts an `ssr` route, nor an unknown one, nor a POST', () => {
    const h = harness();
    const r = router(h);
    for (const event of [
      fetchEvent(`${ORIGIN}account`),
      fetchEvent(`${ORIGIN}nope/nope`),
      fetchEvent(`${ORIGIN}blog/x`, { method: 'POST' }),
    ]) {
      r.handle(event);
      expect(event.responded).toBeNull();
    }
  });

  it('§6.13 a cold `sw` route is left to the network and warms behind it', async () => {
    const h = harness();
    const r = router(h);
    const event = fetchEvent(`${ORIGIN}blog/x`);
    r.handle(event);
    expect(event.responded).toBeNull();
    expect(event.waits).toHaveLength(1);
    await Promise.all(event.waits);
    // Deps first, then the chunk: `require` is synchronous, so order is the contract.
    expect(h.network).toEqual([`${ORIGIN}sw/c/dep-b1.js`, `${ORIGIN}sw/c/blog-slug-b1.js`]);
  });

  it('§6.14/§6.15 a warm `sw` route renders locally, once, with a fresh nonce', async () => {
    const h = harness();
    const r = router(h);
    await r.warm('/blog/x');

    const first = fetchEvent(`${ORIGIN}blog/x`);
    r.handle(first);
    expect(first.responded).not.toBeNull();
    const response = await first.responded!;
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('content-security-policy')).toContain("'nonce-nonce1'");
    // §6.15: the ctx the chunk received carries params, data and THAT nonce.
    expect(await readAll(response.body!)).toBe('<!DOCTYPE html><p nonce="nonce1">x:42</p>');

    const second = fetchEvent(`${ORIGIN}blog/x`);
    r.handle(second);
    expect((await second.responded!).headers.get('content-security-policy')).toContain(
      "'nonce-nonce2'",
    );
  });

  it('§6.16 a link failure rescues once and then stops retrying that route', async () => {
    const h = harness();
    h.sources.set(`${ORIGIN}sw/c/blog-slug-b1.js`, 'require("./absent.js");');
    const dead: string[] = [];
    const errors: unknown[] = [];
    const r = router(h, { onDead: (p: string) => dead.push(p), onError: (_p: string, e: unknown) => errors.push(e) });
    await r.warm('/blog/x');

    const first = fetchEvent(`${ORIGIN}blog/x`);
    r.handle(first);
    const response = await first.responded!;
    expect(response.headers.get('x-fudic-fallback')).toBe('link-error');
    expect(dead).toEqual(['/blog/:slug']);
    expect(errors).toHaveLength(1);

    const second = fetchEvent(`${ORIGIN}blog/x`);
    r.handle(second);
    expect(second.responded).toBeNull(); // dead: straight to the network
  });

  it('§6.17 a rendered page carries a fresh nonce, in the body and in the CSP', async () => {
    const h = harness();
    const r = router(h);
    const cold = fetchEvent(`${ORIGIN}about`);
    r.handle(cold);
    expect(cold.responded).toBeNull(); // cold: the network serves it, the template warms
    await Promise.all(cold.waits);

    const warm = fetchEvent(`${ORIGIN}about`);
    r.handle(warm);
    const response = await warm.responded!;
    const html = await response.text();
    expect(html).not.toContain(NONCE_TOKEN);
    expect(html).toContain('nonce="nonce2"');
    expect(response.headers.get('content-security-policy')).toContain("'nonce-nonce2'");
  });

  it('persists the render only when the route asks for it, under the NAVIGATION url', async () => {
    const h = harness();
    const r = persistRouter(h);
    await r.warm('/blog/x');
    const event = fetchEvent(`${ORIGIN}blog/x`);
    r.handle(event);
    await readAll((await event.responded!).body!);
    await settle();
    // §6.9: `/blog/x`, never `/blog/x/index.html`. The key is the URL the user visits.
    expect(await h.stores.pages.keys()).toEqual([`${ORIGIN}blog/x`]);
  });
});

/**
 * BUG-02 §6.9–§6.12: `pages` holds RENDERS, keyed by the navigation URL. Nothing enters
 * it by download, and what comes out of it gets a nonce of its own.
 */
describe('createRouter — the page cache holds renders, not documents (BUG-02)', () => {
  /** Render `/blog/x` once so it is persisted, and return the router that did it. */
  async function withPersistedPage(h: ReturnType<typeof harness>): Promise<Router> {
    const r = persistRouter(h);
    await r.warm('/blog/x');
    const event = fetchEvent(`${ORIGIN}blog/x`);
    r.handle(event);
    await readAll((await event.responded!).body!);
    await settle();
    return r;
  }

  it('§6.10/§6.11 two hits on a persisted page get two different nonces', async () => {
    const h = harness();
    const nonces = (function* () {
      let n = 0;
      while (true) yield `n${(n += 1)}`;
    })();
    const r = persistRouter(h, { nonce: () => nonces.next().value });
    await r.warm('/blog/x');
    const rendered = fetchEvent(`${ORIGIN}blog/x`);
    r.handle(rendered);
    await readAll((await rendered.responded!).body!);
    await settle();

    const bodies: string[] = [];
    const policies: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const event = fetchEvent(`${ORIGIN}blog/x`);
      r.handle(event);
      const response = await event.responded!;
      policies.push(response.headers.get('content-security-policy') ?? '');
      bodies.push(await response.text());
    }
    expect(bodies[0]).not.toEqual(bodies[1]);
    // §6.11: the substitution happened on the way out, not on the way in.
    expect(bodies.join('')).not.toContain(NONCE_TOKEN);
    for (const [i, body] of bodies.entries()) {
      const nonce = /nonce="([^"]+)"/u.exec(body)?.[1] ?? '';
      expect(nonce).not.toBe('');
      expect(policies[i]).toContain(`'nonce-${nonce}'`);
    }
  });

  it('§6.12 invalidate drops the page of that navigation URL and its data', async () => {
    const h = harness();
    const r = await withPersistedPage(h);
    expect(await h.stores.pages.match(`${ORIGIN}blog/x`)).toBeDefined();
    await r.invalidate('/blog/x');
    expect(await h.stores.pages.match(`${ORIGIN}blog/x`)).toBeUndefined();
    expect(await h.stores.data.match(`${ORIGIN}_fudic/data/blog/x`)).toBeUndefined();
    await r.invalidate('/nope'); // unknown route: no-op
  });

  it('falls back to the network if the page was evicted after the decision', async () => {
    const h = harness();
    const r = await withPersistedPage(h);
    // Evicted behind the router's back: the in-memory index still says it is there.
    await h.stores.pages.delete(`${ORIGIN}blog/x`);
    h.sources.delete(`${ORIGIN}blog/x`);
    const event = fetchEvent(`${ORIGIN}blog/x`);
    r.handle(event);
    expect((await event.responded!).status).toBe(404);
  });
});

/**
 * BUG-02 §6.1–§6.12: one shell and one chunk per route, never one HTML per route. The
 * prerendered document exists for the FIRST visit and nothing else; once the Service
 * Worker is in control it renders every navigation from chunk + data.
 */
describe('createRouter — the SW renders, it does not cache documents (BUG-02)', () => {
  it('§6.1 warming a prerendered route downloads its chunk and deps, never a document', async () => {
    const h = harness();
    await router(h).warm('/about');
    expect(h.network).toEqual([`${ORIGIN}sw/c/about-b1.js`]);
  });

  it('§6.2 no URL ending in .html is ever requested, in a whole install→warm→nav→nav cycle', async () => {
    const h = harness();
    const r = router(h);
    await r.ready(); // the recycled-SW rehydration
    await r.warm('/about');
    for (let i = 0; i < 2; i += 1) {
      const event = fetchEvent(`${ORIGIN}about`);
      r.handle(event);
      await Promise.all(event.waits);
      if (event.responded !== null) {
        await (await event.responded).text();
      }
    }
    expect(h.network.filter((url) => url.endsWith('.html'))).toEqual([]);
  });

  it('§6.5 a warm prerendered route is RENDERED by the SW, with its own mode and origin', async () => {
    const h = harness();
    const r = router(h);
    await r.warm('/about');
    const event = fetchEvent(`${ORIGIN}about`);
    r.handle(event);
    expect(event.responded).not.toBeNull();
    // The context the chunk received: the SW is the origin, `ssg` is only the build fact.
    expect(await (await event.responded!).text()).toContain('sw:ssg');
  });

  it('§6.6 a cold prerendered route is left to the network and warms behind it', async () => {
    const h = harness();
    const r = router(h);
    const event = fetchEvent(`${ORIGIN}about`);
    r.handle(event);
    expect(event.responded).toBeNull();
    expect(event.waits).toHaveLength(1);
    await Promise.all(event.waits);
    expect(h.network).toEqual([`${ORIGIN}sw/c/about-b1.js`]);
  });

  it('§6.7 an `ssr` route is never intercepted and its chunk is never downloaded', async () => {
    const h = harness();
    const r = router(h);
    const event = fetchEvent(`${ORIGIN}account`);
    r.handle(event);
    expect(event.responded).toBeNull();
    await r.warm('/account');
    expect(h.network).toEqual([]);
  });

  it('§6.8 a record with no chunk falls to the network without throwing', async () => {
    const h = harness();
    const r = router(h);
    await r.warm('/orphan'); // nothing to warm: there is no chunk
    const event = fetchEvent(`${ORIGIN}orphan`);
    r.handle(event);
    expect(event.responded).toBeNull();
    await Promise.all(event.waits);
    expect(h.network).toEqual([]);
  });
});

/**
 * BUG-01 §6.1–§6.8: what `install` precaches, `fetch` serves. The shell is IDENTITY —
 * exact URLs, evaluated before any resource class — and it has exactly one policy.
 */
describe('createRouter — the shell has a policy (BUG-01)', () => {
  const SHELL = ['/fudic-main.js', '/fudic-routes.json'];
  const ASSETS = [{ pattern: '/assets/**', policy: 'cache-first' as const, ttl: null }];

  /** A router that knows the shell, plus one ordinary resource class. */
  const shellRouter = (h: ReturnType<typeof harness>, extra: Record<string, unknown> = {}) =>
    router(h, { shell: SHELL, resources: ASSETS, ...extra });

  /** Simulate the `install` precache: the entry lands in `shell-<build>`. */
  const precache = (h: ReturnType<typeof harness>, path: string, body: string): Promise<void> =>
    h.stores.shell.put(`${ORIGIN}${path}`, new Response(body));

  it('§6.1 serves a precached shell entry from `shell`, without touching the network', async () => {
    const h = harness();
    await precache(h, 'fudic-main.js', 'main()');
    const event = fetchEvent(`${ORIGIN}fudic-main.js`, { mode: 'no-cors' });
    shellRouter(h).handle(event);
    expect(event.responded).not.toBeNull();
    expect(await (await event.responded!).text()).toBe('main()');
    expect(h.network).toEqual([]);
  });

  it('§6.2 does not depend on there being resource classes at all', async () => {
    const h = harness();
    await precache(h, 'fudic-main.js', 'main()');
    const event = fetchEvent(`${ORIGIN}fudic-main.js`, { mode: 'no-cors' });
    router(h, { shell: SHELL, resources: [] }).handle(event);
    expect(await (await event.responded!).text()).toBe('main()');
    expect(h.network).toEqual([]);
  });

  it('§6.3 identity beats class: a `/**` rule never captures a shell entry', async () => {
    const h = harness();
    await precache(h, 'fudic-main.js', 'main()');
    const event = fetchEvent(`${ORIGIN}fudic-main.js`, { mode: 'no-cors' });
    shellRouter(h, { resources: [{ pattern: '/**', policy: 'cache-first', ttl: null }] }).handle(event);
    expect(await (await event.responded!).text()).toBe('main()');
    // One cache, one reader: the shell copy is the only copy.
    expect(await h.stores.data.keys()).toEqual([]);
  });

  it('§6.4 a shell entry that is not cached degrades to the network and seals into `shell`', async () => {
    const h = harness();
    h.sources.set(`${ORIGIN}fudic-main.js`, 'main()');
    const event = fetchEvent(`${ORIGIN}fudic-main.js`, { mode: 'no-cors' });
    shellRouter(h).handle(event);
    expect(await (await event.responded!).text()).toBe('main()');
    expect(h.network).toEqual([`${ORIGIN}fudic-main.js`]);
    expect(await h.stores.shell.keys()).toEqual([`${ORIGIN}fudic-main.js`]);
    expect(await h.stores.data.keys()).toEqual([]);
  });

  it('§6.6 leaves a URL alone when it is neither in the shell nor in a class', () => {
    const h = harness();
    const event = fetchEvent(`${ORIGIN}img/a.png`, { mode: 'no-cors' });
    shellRouter(h).handle(event);
    expect(event.responded).toBeNull();
  });

  it('§6.8 the manifest is a shell entry too: from cache, never from the network', async () => {
    const h = harness();
    await precache(h, 'fudic-routes.json', '{"build":"b1"}');
    const event = fetchEvent(`${ORIGIN}fudic-routes.json`, { mode: 'cors' });
    shellRouter(h).handle(event);
    expect(await (await event.responded!).text()).toBe('{"build":"b1"}');
    expect(h.network).toEqual([]);
  });

  it('§6.5 wiring audit: every store of RouterStores has at least one reader', async () => {
    const network: string[] = [];
    const net = async (request: Request): Promise<Response> => {
      network.push(request.url);
      if (request.url.endsWith('sw/c/blog-slug-b1.js')) return new Response(CHUNK_SOURCE);
      if (request.url.endsWith('sw/c/dep-b1.js')) return new Response('exports.v = 1;');
      if (request.url.endsWith('_fudic/data/blog/x')) return new Response('{"n":42}');
      return new Response('[]');
    };
    const doubles = {
      shell: countingCache(),
      routes: countingCache(),
      pages: countingCache(),
      data: countingCache(),
    };
    const stores: RouterStores = {
      shell: createStore({ cache: doubles.shell.cache, net }),
      routes: createStore({ cache: doubles.routes.cache, net }),
      pages: createStore({ cache: doubles.pages.cache, net }),
      data: createStore({ cache: doubles.data.cache, net }),
    };
    const persisted: ManifestFile = {
      ...FILE,
      routes: FILE.routes.map((route) =>
        route.pattern === '/blog/:slug'
          ? { ...route, page: { cache: 'persist' as const, ttl: null } }
          : route,
      ),
    };
    const r = createRouter({
      table: compileManifest(persisted),
      linker: linkerOver(stores.routes),
      stores,
      origin: ORIGIN,
      net,
      nonce: () => 'n',
      shell: SHELL,
      resources: [{ pattern: '/api/**', policy: 'cache-first', ttl: null }],
    });

    // install → warm → render (persists) → second navigation (serves the persisted page)
    await stores.shell.put(`${ORIGIN}fudic-main.js`, new Response('main()'));
    await r.warm('/blog/x');
    const first = fetchEvent(`${ORIGIN}blog/x`);
    r.handle(first);
    await readAll((await first.responded!).body!);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = fetchEvent(`${ORIGIN}blog/x`);
    r.handle(second);
    await (await second.responded!).text();
    // …then a shell resource and a class resource.
    for (const url of [`${ORIGIN}fudic-main.js`, `${ORIGIN}api/items`]) {
      const event = fetchEvent(url, { mode: 'no-cors' });
      r.handle(event);
      await (await event.responded!).text();
    }

    expect(doubles.shell.matches()).toBeGreaterThan(0);
    expect(doubles.routes.matches()).toBeGreaterThan(0);
    expect(doubles.pages.matches()).toBeGreaterThan(0);
    expect(doubles.data.matches()).toBeGreaterThan(0);
  });
});

describe('createRouter — resources, ready and invalidate', () => {
  it('applies a sw.json resource rule to a non-navigation request', async () => {
    const h = harness();
    h.data.set(`${ORIGIN}api/items`, '[]');
    const r = router(h, {
      resources: [{ pattern: '/api/**', policy: 'cache-first', ttl: null, maxEntries: 10 }],
    });
    const event = fetchEvent(`${ORIGIN}api/items`, { mode: 'cors' });
    r.handle(event);
    expect(await (await event.responded!).text()).toBe('[]');
  });

  it('leaves a non-navigation request alone when no rule matches', () => {
    const h = harness();
    const r = router(h, { resources: [{ pattern: '/api/**', policy: 'cache-first', ttl: null }] });
    const event = fetchEvent(`${ORIGIN}img/a.png`, { mode: 'cors' });
    r.handle(event);
    expect(event.responded).toBeNull();
  });

  it('ready() seeds the page index from the cache, so a recycled SW serves at once', async () => {
    const h = harness();
    // Keyed by the navigation URL, because that is what a render was stored under.
    await h.stores.pages.put(`${ORIGIN}about`, new Response('<html></html>'));
    const r = router(h);
    await r.ready();
    const event = fetchEvent(`${ORIGIN}about`);
    r.handle(event);
    expect(event.responded).not.toBeNull();
  });

  it("defaults its base to the Service Worker's own location", async () => {
    const h = harness();
    // Without `origin` the router resolves manifest paths against `location.href` — the
    // SW script URL. Node has no `location`, hence the fallback the other tests exercise.
    vi.stubGlobal('location', { href: 'https://stub.test/fudic-sw.js' });
    try {
      const r = createRouter({
        table: compileManifest(FILE),
        linker: linkerOver(h.stores.routes),
        stores: h.stores,
        net: h.net,
      });
      await r.warm('/about');
      expect(h.network).toEqual(['https://stub.test/sw/c/about-b1.js']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a page that cannot be persisted still gets served', async () => {
    // `persist` is memoization. If the write fails — quota, a cache deleted underneath —
    // the render the user is waiting for must not be affected.
    const h = harness();
    const failing: RouterStores = {
      ...h.stores,
      pages: createStore({
        cache: {
          match: async () => undefined,
          put: async () => {
            throw new Error('QuotaExceededError');
          },
          delete: async () => false,
          keys: async () => [],
        } as unknown as Cache,
        net: h.net,
      }),
    };
    const r = persistRouter({ ...h, stores: failing });
    await r.warm('/blog/x');
    const event = fetchEvent(`${ORIGIN}blog/x`);
    r.handle(event);
    expect(await readAll((await event.responded!).body!)).toContain('x:42');
    await settle();
  });

  it('warm is idempotent and ignores routes it does not own', async () => {
    const h = harness();
    const r = router(h);
    await r.warm('/blog/x');
    await r.warm('/blog/y');
    await r.warm('/account');
    await r.warm('/nope');
    expect(h.network.filter((u) => u.endsWith('blog-slug-b1.js'))).toHaveLength(1);
  });
});

/** SDD-17 §4.7: the page orders BY TAG, and the manifest says what that tag drags along. */
describe('createRouter.warmHydration — the hydration chunks', () => {
  const ASSETS = [{ pattern: '/assets/**', policy: 'cache-first' as const, ttl: null }];
  const CHUNK = `${ORIGIN}assets/h/app-counter-b1.js`;
  const SHARED = `${ORIGIN}assets/element-DUSE73WP.js`;
  /** The same build, with the client pass having shared code between components. */
  const HYDRATING: ManifestFile = {
    ...FILE,
    hydrate: { 'app-counter': ['assets/element-DUSE73WP.js'] },
  };

  function withChunks(): ReturnType<typeof harness> {
    const h = harness();
    h.sources.set(CHUNK, 'import "../element-DUSE73WP.js";');
    h.sources.set(SHARED, 'export const t = 1;');
    return h;
  }

  function hydratingRouter(h: ReturnType<typeof harness>, extra: Record<string, unknown> = {}): Router {
    return createRouter({
      table: compileManifest(HYDRATING),
      linker: linkerOver(h.stores.routes),
      stores: h.stores,
      origin: ORIGIN,
      net: h.net,
      resources: ASSETS,
      ...extra,
    });
  }

  it('deposits the chunk AND what it imports, where the fetch handler will read them', async () => {
    const h = withChunks();
    const r = hydratingRouter(h);

    expect(await r.warmHydration(['app-counter'])).toEqual(['app-counter']);
    expect(h.network).toEqual([CHUNK, SHARED]);

    // The point of the whole function: the first interaction pays no network, for the
    // component's chunk NOR for the framework code it imports.
    for (const url of [CHUNK, SHARED]) {
      const event = fetchEvent(url, { mode: 'cors' });
      r.handle(event);
      await event.responded;
    }
    expect(h.network).toEqual([CHUNK, SHARED]);
  });

  it('is the second layer of idempotence: a repeated order costs no network', async () => {
    const h = withChunks();
    const r = hydratingRouter(h);

    await r.warmHydration(['app-counter']);
    expect(await r.warmHydration(['app-counter'])).toEqual(['app-counter']);

    expect(h.network).toHaveLength(2);
  });

  it('a tag the manifest knows nothing about is just its own chunk', async () => {
    const h = harness();
    h.sources.set(`${ORIGIN}assets/h/app-toggle-b1.js`, 'export {};');
    const r = hydratingRouter(h);

    expect(await r.warmHydration(['app-toggle'])).toEqual(['app-toggle']);
    expect(h.network).toEqual([`${ORIGIN}assets/h/app-toggle-b1.js`]);
  });

  it('does not warm what it would not serve either', async () => {
    const h = withChunks();
    const r = hydratingRouter(h, {
      resources: [{ pattern: '/api/**', policy: 'cache-first', ttl: null }],
    });

    expect(await r.warmHydration(['app-counter'])).toEqual([]);
    expect(h.network).toEqual([]);
  });

  it('reports nothing for a tag whose graph did not land whole', async () => {
    const h = harness(); // the chunk is there, its shared import is not
    h.sources.set(CHUNK, 'import "../element-DUSE73WP.js";');
    const offline: RouterStores = {
      ...h.stores,
      data: createStore({
        cache: fakeCache().cache,
        net: async (request: Request): Promise<Response> => {
          if (request.url === SHARED) throw new Error('offline');
          return h.net(request);
        },
      }),
    };
    const r = hydratingRouter(h, { stores: offline });

    // Half a graph in cache still pays network on the first interaction, so it is not a
    // warm and it is not reported as one. And nothing here throws: warm is optimization.
    expect(await r.warmHydration(['app-counter'])).toEqual([]);
  });
});
