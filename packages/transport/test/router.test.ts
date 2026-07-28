/**
 * SDD-20 §6.13–§6.18: the one synchronous decision, the render, the nonce, and the
 * rules that exist because the prototype broke them (duplicate document request,
 * missing CSP, retrying a dead route on every navigation).
 */

import { describe, expect, it } from 'vitest';
import { compileManifest, type ManifestFile } from '../src/manifest.js';
import { createLinker } from '../src/linker.js';
import { createStore, type Store } from '../src/store.js';
import { createRouter, type RouterStores } from '../src/router.js';
import { DEFAULT_CSP, NONCE_TOKEN } from '../src/csp.js';
import { fakeCache, fetchEvent, readAll } from './helpers.js';

const ORIGIN = 'https://app.test/';

/** The chunk the linker will evaluate: a real `exports`/`require` module text. */
const CHUNK_SOURCE = `
const { html } = require('@fudic/ssr');
exports.render = function (ctx) {
  return html('<!DOCTYPE html><p nonce="' + ctx.nonce + '">' + ctx.params.slug + ':' + ctx.data.n + '</p>');
};
`;

const FILE: ManifestFile = {
  build: 'b1',
  csp: DEFAULT_CSP,
  routes: [
    { pattern: '/about', mode: 'ssg', html: '/about/index.html' },
    {
      pattern: '/blog/:slug',
      mode: 'sw',
      chunk: '/sw/c/blog.js',
      deps: ['/sw/c/dep.js'],
      data: '/_fudic/data/blog/:slug',
      dataPolicy: { policy: 'cache-first', ttl: null },
    },
    { pattern: '/account', mode: 'ssr' },
  ],
};

function harness(): {
  readonly stores: RouterStores;
  readonly network: string[];
  readonly sources: Map<string, string>;
  readonly data: Map<string, string>;
  readonly net: (request: Request) => Promise<Response>;
  readonly store: (kind: 'routes' | 'pages' | 'data') => Store;
} {
  const network: string[] = [];
  const sources = new Map<string, string>([
    [`${ORIGIN}sw/c/blog.js`, CHUNK_SOURCE],
    [`${ORIGIN}sw/c/dep.js`, 'exports.v = 1;'],
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
  const stores: RouterStores = { routes: make(), pages: make(), data: make() };
  return { stores, network, sources, data, net, store: (kind) => stores[kind] };
}

function router(h: ReturnType<typeof harness>, extra: Record<string, unknown> = {}) {
  const linker = createLinker({
    fetchSource: async (url) => (await h.stores.routes.get(new Request(url), 'cache-first', null)).text(),
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
  return createRouter({
    table: compileManifest(FILE),
    linker,
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
    expect(h.network).toEqual([`${ORIGIN}sw/c/dep.js`, `${ORIGIN}sw/c/blog.js`]);
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
    h.sources.set(`${ORIGIN}sw/c/blog.js`, 'require("./absent.js");');
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

  it('§6.17 a cached ssg page is served with the nonce token substituted', async () => {
    const h = harness();
    const r = router(h);
    const cold = fetchEvent(`${ORIGIN}about`);
    r.handle(cold);
    expect(cold.responded).toBeNull(); // not cached yet: the network serves it
    await Promise.all(cold.waits);

    const warm = fetchEvent(`${ORIGIN}about`);
    r.handle(warm);
    const response = await warm.responded!;
    const html = await response.text();
    expect(html).not.toContain(NONCE_TOKEN);
    expect(html).toContain('nonce="nonce2"');
    expect(response.headers.get('content-security-policy')).toContain("'nonce-nonce2'");
  });

  it('§6.17 falls back to the network if the page was evicted after the decision', async () => {
    const h = harness();
    const r = router(h);
    await r.warm('/about');
    await h.stores.pages.delete(new Request(`${ORIGIN}about/index.html`));
    const event = fetchEvent(`${ORIGIN}about`);
    r.handle(event);
    expect((await event.responded!).status).toBe(404);
  });

  it('persists the HTML only when the route asks for it', async () => {
    const h = harness();
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
      linker: createLinker({
        fetchSource: async (url) =>
          (await h.stores.routes.get(new Request(url), 'cache-first', null)).text(),
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
      }),
      stores: h.stores,
      origin: ORIGIN,
      net: h.net,
      nonce: () => 'n',
    });
    await r.warm('/blog/x');
    const event = fetchEvent(`${ORIGIN}blog/x`);
    r.handle(event);
    await readAll((await event.responded!).body!);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await h.stores.pages.match(new Request(`${ORIGIN}blog/x`))).toBeDefined();
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
    await h.stores.pages.put(new Request(`${ORIGIN}about/index.html`), new Response('<html></html>'));
    const r = router(h);
    await r.ready();
    const event = fetchEvent(`${ORIGIN}about`);
    r.handle(event);
    expect(event.responded).not.toBeNull();
  });

  it('invalidate drops the cached page and its data', async () => {
    const h = harness();
    const r = router(h);
    await r.warm('/about');
    await r.invalidate('/about');
    const event = fetchEvent(`${ORIGIN}about`);
    r.handle(event);
    expect(event.responded).toBeNull();
    await r.invalidate('/nope'); // unknown route: no-op
  });

  it('warm is idempotent and ignores routes it does not own', async () => {
    const h = harness();
    const r = router(h);
    await r.warm('/blog/x');
    await r.warm('/blog/y');
    await r.warm('/account');
    await r.warm('/nope');
    expect(h.network.filter((u) => u.endsWith('blog.js'))).toHaveLength(1);
  });
});
