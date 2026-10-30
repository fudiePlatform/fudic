/**
 * SDD-56 §4.8–§4.10 and criteria 30–34, the Service Worker's side.
 *
 * The worker never touches a server function, a data endpoint that answers with an error
 * leaves the navigation to the network without killing the route, and `invalidatePattern`
 * forgets every URL of a pattern it holds anything for.
 */

import { describe, expect, it, vi } from 'vitest';
import { compileManifest, type ManifestFile } from '../src/manifest.js';
import { createLinker } from '../src/linker.js';
import { createStore, type Store } from '../src/store.js';
import { createRouter, type RouterStores } from '../src/router.js';
import { DEFAULT_CSP } from '../src/csp.js';
import { INVALIDATE_MESSAGE } from '../src/index.js';
import { fakeCache, fetchEvent, framedData, readAll } from './helpers.js';

const ORIGIN = 'https://app.test/';

const CHUNK = `
const { html } = require('@fudic/ssr');
exports.render = function (ctx) {
  return html('<!DOCTYPE html><p>' + ctx.params.slug + ':' + ctx.data.n + '</p>');
};
`;

const file = (base: string): ManifestFile => ({
  build: 'b1',
  base,
  csp: DEFAULT_CSP,
  routes: [
    {
      pattern: '/blog/:slug',
      mode: 'sw',
      deps: [],
      dataPolicy: { policy: 'cache-first', ttl: null },
      page: { cache: 'persist', ttl: null },
    },
    { pattern: '/about', mode: 'sw', deps: [], dataPolicy: { policy: 'cache-first', ttl: null } },
  ],
});

/** A worker over fake caches; the network answers from `answers`, or 404. */
function worker(base = '/', extra: Record<string, unknown> = {}) {
  const root = `${ORIGIN}${base.slice(1)}`;
  const network: string[] = [];
  const answers = new Map<string, { body: string; status?: number }>([
    [`${root}sw/c/blog-slug-b1.js`, { body: CHUNK }],
    [`${root}sw/c/about-b1.js`, { body: CHUNK }],
  ]);
  const net = async (request: Request): Promise<Response> => {
    network.push(`${request.method} ${request.url}`);
    const hit = answers.get(request.url);
    if (hit === undefined) return new Response('net', { status: 200 });
    return request.url.includes('/_fudic/data/') ? framedData(hit.body, hit.status) : new Response(hit.body, { status: hit.status ?? 200 });
  };
  const make = (): Store => createStore({ cache: fakeCache().cache, net });
  const stores: RouterStores = { shell: make(), routes: make(), pages: make(), data: make() };
  const r = createRouter({
    table: compileManifest(file(base)),
    linker: createLinker({
      fetchSource: async (url) => (await stores.routes.get(url, 'cache-first', null)).text(),
      builtins: {
        '@fudic/ssr': {
          html: (text: string) =>
            new ReadableStream({
              start(c) {
                c.enqueue(new TextEncoder().encode(text));
                c.close();
              },
            }),
        },
      },
    }),
    stores,
    origin: ORIGIN,
    net,
    nonce: () => 'n',
    ...extra,
  });
  return { r, stores, network, answers, root };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('criterion 34: the worker does not touch a server function', () => {
  const urls = ['_fudic/fn/routes/blog/a/save', '_fudic/fn/components/user-form/save', '_fudic/fn/routes/search'];

  it.each(['GET', 'PUT', 'POST', 'DELETE'])('%s to /_fudic/fn/** gets no respondWith', (method) => {
    const { r } = worker('/', {
      resources: [
        { pattern: '/**', policy: 'cache-first', ttl: null },
        { pattern: '/_fudic/**', policy: 'network-first', ttl: null },
      ],
    });
    for (const path of urls) {
      const nav = fetchEvent(`${ORIGIN}${path}`, method === 'GET' ? {} : { method, body: '{}' });
      r.handle(nav);
      expect(nav.responded).toBeNull();
      const cors = fetchEvent(`${ORIGIN}${path}`, { mode: 'cors' });
      r.handle(cors);
      expect(cors.responded).toBeNull();
    }
  });

  it('even with a sw.json rule that captures exactly that prefix', () => {
    const { r } = worker('/', { resources: [{ pattern: '/_fudic/fn/**', policy: 'cache-first', ttl: null }] });
    const event = fetchEvent(`${ORIGIN}_fudic/fn/routes/search?a=1`, { mode: 'cors' });
    r.handle(event);
    expect(event.responded).toBeNull();
  });

  it('respond() hands it straight to the network, uncached', async () => {
    const { r, network, stores } = worker('/', { resources: [{ pattern: '/**', policy: 'cache-first', ttl: null }] });
    const event = fetchEvent(`${ORIGIN}_fudic/fn/routes/search`, { mode: 'cors' });
    expect(await (await r.respond(event as unknown as Parameters<typeof r.respond>[0])).text()).toBe('net');
    expect(network).toEqual([`GET ${ORIGIN}_fudic/fn/routes/search`]);
    expect(await stores.data.keys()).toEqual([]);
  });

  it('respond() still decides for everything else: a warm route renders, an unknown URL goes to the network', async () => {
    const w = worker();
    w.answers.set(`${ORIGIN}_fudic/data/blog/x`, { body: '{"data":{"n":5}}' });
    await w.r.warm('/blog/x');
    const page = await w.r.respond(fetchEvent(`${ORIGIN}blog/x`) as unknown as Parameters<typeof w.r.respond>[0]);
    expect(await readAll(page.body!)).toContain('x:5');
    const other = await w.r.respond(fetchEvent(`${ORIGIN}nope`) as unknown as Parameters<typeof w.r.respond>[0]);
    expect(await other.text()).toBe('net');
  });

  it('with a base, the prefix carries it', () => {
    const { r } = worker('/app/', { resources: [{ pattern: '/**', policy: 'cache-first', ttl: null }] });
    const event = fetchEvent(`${ORIGIN}app/_fudic/fn/routes/search`, { mode: 'cors' });
    r.handle(event);
    expect(event.responded).toBeNull();
  });

  it('something merely named like it is still the worker’s', () => {
    const { r } = worker('/', { resources: [{ pattern: '/**', policy: 'cache-first', ttl: null }] });
    const event = fetchEvent(`${ORIGIN}_fudic/fnord.js`, { mode: 'cors' });
    r.handle(event);
    expect(event.responded).not.toBeNull();
  });
});

describe('criterion 30: a data endpoint that answers with an error', () => {
  it('leaves that navigation to the network and does not mark the route dead', async () => {
    const dead: string[] = [];
    const errors: unknown[] = [];
    const w = worker('/', { onDead: (p: string) => dead.push(p), onError: (_: string, e: unknown) => errors.push(e) });
    w.answers.set(`${ORIGIN}_fudic/data/blog/missing`, { body: '{"status":404,"title":"Not Found"}', status: 404 });
    w.answers.set(`${ORIGIN}_fudic/data/blog/there`, { body: '{"data":{"n":7}}' });
    await w.r.warm('/blog/missing');

    const first = fetchEvent(`${ORIGIN}blog/missing`);
    w.r.handle(first);
    const response = await first.responded!;
    expect(await response.text()).toBe('net');
    expect(w.network).toContain(`GET ${ORIGIN}blog/missing`);
    expect(dead).toEqual([]);
    expect(errors).toEqual([]);

    // The next URL of the same pattern is rendered by the worker.
    const second = fetchEvent(`${ORIGIN}blog/there`);
    w.r.handle(second);
    expect(second.responded).not.toBeNull();
    expect(await readAll((await second.responded!).body!)).toContain('there:7');
  });

  it.each([303, 500])('a %i is the same branch', async (status) => {
    const dead: string[] = [];
    const w = worker('/', { onDead: (p: string) => dead.push(p) });
    w.answers.set(`${ORIGIN}_fudic/data/blog/x`, { body: '{}', status });
    await w.r.warm('/blog/x');
    const event = fetchEvent(`${ORIGIN}blog/x`);
    w.r.handle(event);
    expect(await (await event.responded!).text()).toBe('net');
    expect(dead).toEqual([]);
  });

  it('the error response is not kept in the data cache', async () => {
    const w = worker();
    w.answers.set(`${ORIGIN}_fudic/data/blog/missing`, { body: '{}', status: 404 });
    await w.r.warm('/blog/missing');
    const event = fetchEvent(`${ORIGIN}blog/missing`);
    w.r.handle(event);
    await event.responded;
    await settle();
    expect(await w.stores.data.match(`${ORIGIN}_fudic/data/blog/missing`)).toBeUndefined();
  });
});

describe('criteria 31–32, the worker side: invalidatePattern', () => {
  /** A worker that has rendered `/blog/a` and `/blog/b` and holds `/about`'s data. */
  async function primed(base = '/') {
    const w = worker(base);
    const data = `${w.root}_fudic/data`;
    w.answers.set(`${data}/blog/a`, { body: '{"data":{"n":1}}' });
    w.answers.set(`${data}/blog/b`, { body: '{"data":{"n":2}}' });
    w.answers.set(`${data}/about`, { body: '{"data":{"n":3}}' });
    await w.r.warm(`${base}blog/a`.replace('//', '/'));
    await w.r.warm(`${base}about`.replace('//', '/'));
    for (const path of ['blog/a', 'blog/b', 'about']) {
      const event = fetchEvent(`${w.root}${path}`);
      w.r.handle(event);
      await readAll((await event.responded!).body!);
    }
    await settle();
    return { ...w, data };
  }

  it('criterion 32: /blog/:slug drops the data and the pages of /blog/a and /blog/b, nothing else', async () => {
    const w = await primed();
    expect(await w.stores.data.match(`${w.data}/blog/a`)).toBeDefined();
    expect(await w.stores.pages.match(`${ORIGIN}blog/b`)).toBeDefined();

    await w.r.invalidatePattern('/blog/:slug');

    expect(await w.stores.data.match(`${w.data}/blog/a`)).toBeUndefined();
    expect(await w.stores.data.match(`${w.data}/blog/b`)).toBeUndefined();
    expect(await w.stores.pages.match(`${ORIGIN}blog/a`)).toBeUndefined();
    expect(await w.stores.pages.match(`${ORIGIN}blog/b`)).toBeUndefined();
    expect(await w.stores.data.match(`${w.data}/about`)).toBeDefined();
  });

  it('criterion 31: a concrete path through invalidate drops only that URL', async () => {
    const w = await primed();
    await w.r.invalidate('/blog/a');
    expect(await w.stores.data.match(`${w.data}/blog/a`)).toBeUndefined();
    expect(await w.stores.data.match(`${w.data}/blog/b`)).toBeDefined();
  });

  it('a :param matches one non-empty segment, never more nor fewer', async () => {
    const w = await primed();
    await w.r.invalidatePattern('/blog/:slug/edit');
    await w.r.invalidatePattern('/:x');
    expect(await w.stores.data.match(`${w.data}/blog/a`)).toBeDefined();
    // `/:x` is one segment: `/about` is one of its URLs.
    expect(await w.stores.data.match(`${w.data}/about`)).toBeUndefined();
  });

  it('a pattern of nothing held is a no-op', async () => {
    const w = await primed();
    await w.r.invalidatePattern('/nada/:id');
    expect((await w.stores.data.keys()).length).toBe(3);
  });

  it('with a base, the pattern carries it', async () => {
    const w = await primed('/app/');
    await w.r.invalidatePattern('/app/blog/:slug');
    expect(await w.stores.data.match(`${w.data}/blog/a`)).toBeUndefined();
    expect(await w.stores.data.match(`${w.data}/blog/b`)).toBeUndefined();
    expect(await w.stores.data.match(`${w.data}/about`)).toBeDefined();
  });

  it('a data entry of another origin path is ignored', async () => {
    const w = await primed();
    await w.stores.data.put(`${ORIGIN}elsewhere/blog/z`, new Response('{}'));
    const spy = vi.spyOn(w.r, 'invalidate');
    await w.r.invalidatePattern('/blog/:slug');
    expect(spy.mock.calls.map((c) => c[0]).sort()).toEqual(['/blog/a', '/blog/b']);
  });
});

describe('the message', () => {
  it('is re-exported for the worker, with the value of @fudic/conventions', () => {
    expect(INVALIDATE_MESSAGE).toBe('fudic:invalidate');
  });
});
