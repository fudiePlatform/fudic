/**
 * SDD-70 §3.7 and criterion 21 — a navigation the Service Worker paints, to a route with a
 * `later` field: the frames of its data endpoint are read with the types the route chunk
 * carries, the render starts with the first one and part 0 goes out before the field's frame
 * arrives. With the answer in the cache, every frame is there at once and the page comes whole.
 */

import { describe, expect, it } from 'vitest';
import { DATA_FRAMES_TYPE } from '@fudic/conventions';
import { writeFrames, type SettledField } from '@fudic/http/wire/frames';
import { compileManifest, type ManifestFile } from '../src/manifest.js';
import { createLinker } from '../src/linker.js';
import { createStore, type Store } from '../src/store.js';
import { createRouter, type RouterStores } from '../src/router.js';
import { DEFAULT_CSP } from '../src/csp.js';
import { fakeCache, fetchEvent } from './helpers.js';

const ORIGIN = 'https://app.test/';

/** The types of the route's `load`, as the linked chunk carries them. */
const SHAPE = {
  fields: { title: 'str', users: { list: { ref: 'Person' } } },
  types: { Person: { name: 'str' } },
  later: ['users'],
};

/**
 * A render in two parts, the way the emit writes one: part 0 with what `load` resolved, then
 * the `@await` of `users`, which waits for its field.
 */
const CHUNK = `
exports.dataShape = ${JSON.stringify(SHAPE)};
exports.render = function (ctx) {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(c) {
      c.enqueue(enc.encode('<h1>' + ctx.data.title + '</h1><!--fud-end-->'));
      const users = await ctx.data.users;
      c.enqueue(enc.encode('<ul>' + users.ok.map((u) => '<li>' + u.name + '</li>').join('') + '</ul>'));
      c.close();
    },
  });
};
`;

const FILE: ManifestFile = {
  build: 'b1',
  base: '/',
  csp: DEFAULT_CSP,
  routes: [{ pattern: '/espera', mode: 'sw', deps: [], dataPolicy: { policy: 'cache-first', ttl: null } }],
};

/** A worker whose data endpoint answers frames with a `users` field the test settles. */
function worker() {
  const { promise, resolve } = Promise.withResolvers<SettledField>();
  let asked = 0;
  const net = async (request: Request): Promise<Response> => {
    if (request.url.endsWith('sw/c/espera-b1.js')) return new Response(CHUNK);
    if (request.url.endsWith('_fudic/data/espera')) {
      asked += 1;
      const frames = writeFrames({ fields: { title: 'str', users: { list: { fields: () => ({ name: 'str' }) } } }, later: ['users'] }, { title: 'Usuarios', users: promise });
      return new Response(frames, { headers: { 'content-type': DATA_FRAMES_TYPE } });
    }
    return new Response('net');
  };
  const make = (): Store => createStore({ cache: fakeCache().cache, net });
  const stores: RouterStores = { shell: make(), routes: make(), pages: make(), data: make() };
  const r = createRouter({
    table: compileManifest(FILE),
    linker: createLinker({
      fetchSource: async (url) => (await stores.routes.get(url, 'cache-first', null)).text(),
      builtins: {},
    }),
    stores,
    origin: ORIGIN,
    net,
    nonce: () => 'n',
  });
  return { r, settle: resolve, asked: () => asked };
}

const decoder = new TextDecoder();

describe('criterion 21: the Service Worker paints a route with a later field in parts', () => {
  it('part 0 goes out before the frame of the field, and the rest when it arrives', async () => {
    const w = worker();
    await w.r.warm('/espera');
    const event = fetchEvent(`${ORIGIN}espera`);
    w.r.handle(event);
    const reader = (await event.responded!).body!.getReader();
    expect(decoder.decode((await reader.read()).value)).toBe('<h1>Usuarios</h1><!--fud-end-->');

    w.settle({ ok: [{ name: 'Ana' }] });
    expect(decoder.decode((await reader.read()).value)).toBe('<ul><li>Ana</li></ul>');
    expect((await reader.read()).done).toBe(true);
  });

  it('with the answer in the cache, it comes whole: every frame is already there', async () => {
    const w = worker();
    await w.r.warm('/espera');
    const first = fetchEvent(`${ORIGIN}espera`);
    w.r.handle(first);
    w.settle({ ok: [{ name: 'Ana' }] });
    await new Response((await first.responded!).body).text();

    const second = fetchEvent(`${ORIGIN}espera`);
    w.r.handle(second);
    expect(await new Response((await second.responded!).body).text()).toBe('<h1>Usuarios</h1><!--fud-end--><ul><li>Ana</li></ul>');
    // The second navigation never asked the endpoint: the frames came from the cache.
    expect(w.asked()).toBe(1);
  });
});
