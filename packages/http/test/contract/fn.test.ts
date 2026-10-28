/**
 * SDD-60 §3.3, §3.11, §4.4 and criteria 15, 16, 36, 37 — a function of a `.fudapi`, end to end.
 *
 * `fetch` is the server: it matches the URL the stub built against the function's `<id>` and
 * route, as the dispatcher does, and hands the raw values to `serve`. So what is checked is what
 * a page sees and what a handler is given.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from '@fudic/di';
import { formOf, inTurn, required, serverValidator, str, u8 } from '@fudic/forms/contract';
import {
  contractsOf,
  fn,
  loadingFile,
  middleware,
  pathOf,
  resetRegistry,
  stub,
  use,
  type FnSpec,
  type ServerContract,
} from '../../src/contract/index.js';
import { serve } from '../../src/contract/server.js';
import { HttpError, notFound, redirect, Redirect, ValidationError } from '../../src/errors.js';
import type { DispatchOptions } from '../../src/server/dispatch.js';
import type { ServerContext } from '../../src/types.js';
import { fromBase64url } from '../../src/wire/base64url.js';
import { binWire } from '../../src/wire/bin.js';
import { jsonWire } from '../../src/wire/json.js';
import { formTypes } from '../../src/wire/schema.js';
import type { Ty } from '../../src/wire/ty.js';
import { binProblem } from '../helpers.js';

const ORIGIN = 'https://app.test';
const ID = '0190a6b2-7c1e-7d3a-9f00-1a2b3c4d5e6f';

interface Sent {
  readonly url: URL;
  readonly init: RequestInit;
}

/** The browser is on `pathname`. */
const at = (pathname: string): void => {
  vi.stubGlobal('location', { origin: ORIGIN, pathname });
};

/**
 * `fetch` serving `contract`: the segments of its `<id>` and its route read off the URL, the
 * `[x]` and `:x` ones by value, exactly as the dispatcher of SDD §4.4 does.
 */
function served(contract: ServerContract, options: DispatchOptions = {}): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    sent.push({ url, init });
    const { spec } = contract;
    const base = (spec.base ?? '/').split('/').filter(Boolean);
    const pattern = ['', ...base, '_fudic', 'fn', ...spec.id.split('/'), spec.name, ...(spec.route ?? [])];
    const have = url.pathname.split('/');
    expect(have).toHaveLength(pattern.length);
    const page: Record<string, string> = {};
    const route: Record<string, string> = {};
    pattern.forEach((seg, i) => {
      const value = decodeURIComponent(have[i]!);
      const param = /^\[(.+)\]$/u.exec(seg)?.[1];
      if (param !== undefined) page[param] = value;
      else if (seg.startsWith(':')) route[seg.slice(1)] = value;
      else expect(value).toBe(seg);
    });
    return serve({ request: new Request(url, init), contract, page, route }, options);
  });
  return sent;
}

/** What a handler was given. */
const seen: { ctx?: ServerContext & Record<string, unknown> } = {};
const record = (answer: unknown = 'ok') => (ctx: never) => {
  seen.ctx = ctx;
  return answer;
};

/** `put save /:id` of `routes/blog/[slug]`, `query notify bool`, `active bool`. */
const blogSave = (over: Partial<FnSpec> = {}): FnSpec => ({
  id: 'routes/blog/[slug]',
  name: 'save',
  method: 'PUT',
  page: '/blog/:slug',
  route: [':id'],
  params: { id: 'i32' },
  query: { notify: 'bool' },
  args: { active: 'bool' },
  chain: [],
  wire: binWire,
  ...over,
});

/** `person` of `components/user-form`, trimmed: `age u8` is `required`. */
const person = () =>
  formOf({
    name: str('', [required]),
    age: u8(null, [required]),
  });

beforeEach(() => at('/blog/mi-post'));
afterEach(() => {
  vi.unstubAllGlobals();
  loadingFile(undefined);
  resetRegistry();
  delete seen.ctx;
});

const SAVED: Ty = { fields: () => ({ saved: 'bool' }) };
const SIG = '1a2b3c4d';
const headersOf = (init: RequestInit): Headers => new Headers(init.headers);
const bodyBytes = (init: RequestInit): number[] => [...(init.body as Uint8Array)];

describe('criterion 36: route, query and body', () => {
  it('criterion 5: save({ id, notify, active }) sends 1 byte with its signature, and each value reaches ctx typed', async () => {
    const spec = blogSave({ returns: SAVED, sig: SIG });
    const server = fn(spec);
    server.handle(record({ saved: true }));
    const sent = served(server);
    const save = stub<never, unknown, { id: number; notify: boolean; active: boolean }>(spec);

    expect(await save({ id: 42, notify: true, active: false })).toEqual({ saved: true });

    const { url, init } = sent[0]!;
    expect(url.pathname).toBe('/_fudic/fn/routes/blog/mi-post/save/42');
    expect([...url.searchParams]).toEqual([['notify', 'true']]);
    expect(init.method).toBe('PUT');
    expect(headersOf(init).get('content-type')).toBe('application/fud+bin');
    expect(headersOf(init).get('fud-sig')).toBe(SIG);
    expect(bodyBytes(init)).toEqual([0x00]);
    expect(seen.ctx!.params).toEqual({ slug: 'mi-post', id: 42 });
    expect(seen.ctx!.query).toEqual({ notify: true });
    expect(seen.ctx!.args).toEqual({ active: false });
  });

  it('criterion 11: with use json, the same call carries its keys, no fud-sig, and its problem in JSON', async () => {
    const spec = blogSave({ returns: SAVED, wire: jsonWire });
    const server = fn(spec);
    let fail = false;
    server.handle((() => {
      if (fail) throw notFound('gone');
      return { saved: true };
    }) as never);
    const sent = served(server);
    const save = stub<never, unknown, { id: number; notify: boolean; active: boolean }>(spec);

    expect(await save({ id: 42, notify: true, active: false })).toEqual({ saved: true });
    const { init } = sent[0]!;
    expect(headersOf(init).get('content-type')).toBe('application/json');
    expect(headersOf(init).has('fud-sig')).toBe(false);
    expect(JSON.parse(init.body as string)).toEqual({ active: false });

    fail = true;
    const e = (await save({ id: 42, notify: true, active: false }).catch((x: unknown) => x)) as HttpError;
    expect(e).toBeInstanceOf(HttpError);
    expect(e.problem).toEqual({ status: 404, title: 'Not Found', detail: 'gone' });
  });

  it('the same with form: save({ id, notify, form }) reaches ctx.form validated', async () => {
    const f = person();
    const spec = blogSave({ form: f, args: formTypes(f.$schema), returns: 'str' });
    const server = fn(spec);
    server.handle(record());
    served(server);
    const save = stub<never, unknown, { id: number; notify: boolean; form: typeof f }>(spec);
    f.$set({ name: 'Ana', age: 30 });

    expect(await save({ id: 7, notify: false, form: f })).toBe('ok');
    expect(seen.ctx!.params).toEqual({ slug: 'mi-post', id: 7 });
    expect(seen.ctx!.query).toEqual({ notify: false });
    const form = seen.ctx!['form'] as typeof f;
    expect(form).not.toBe(f);
    expect(form.$value()).toEqual({ name: 'Ana', age: 30 });
  });

  it('criterion 6: a GET sends its body arguments in ?a= as base64url, and its Person[] comes back as it left', async () => {
    const PERSON: Ty = { fields: () => ({ id: 'uuid', name: 'str', born: { opt: 'date' } }) };
    const ana = { id: ID, name: 'Ana', born: new Date('1990-05-01T00:00:00.000Z') };
    const spec: FnSpec = { id: 'routes/usuarios', name: 'search', method: 'GET', args: { q: 'str' }, returns: { list: PERSON }, chain: [], wire: binWire };
    const server = fn(spec);
    server.handle(record([ana, { id: ID, name: 'Eva' }]));
    const sent = served(server);
    const search = stub<never, unknown, { q: string }>(spec);

    expect(await search({ q: 'ana' })).toEqual([ana, { id: ID, name: 'Eva' }]);
    const a = sent[0]!.url.searchParams.get('a')!;
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(binWire.decodeArgs({ q: 'str' }, fromBase64url(a))).toEqual({ q: 'ana' });
    expect(sent[0]!.init.body).toBeUndefined();
    expect(headersOf(sent[0]!.init).has('content-type')).toBe(false);
  });

  it('a GET sends its body arguments in ?a=, beside its query keys', async () => {
    const spec: FnSpec = { id: 'routes/usuarios', name: 'search', method: 'GET', query: { page: { opt: 'u16' } }, args: { q: 'str' }, returns: { list: 'str' }, chain: [], wire: binWire };
    const server = fn(spec);
    server.handle(record(['Ana']));
    const sent = served(server);
    const search = stub<never, string[], { q: string; page?: number }>(spec);

    expect(await search({ q: 'an', page: 2 })).toEqual(['Ana']);
    expect(sent[0]!.url.searchParams.get('page')).toBe('2');
    expect(binWire.decodeArgs({ q: 'str' }, fromBase64url(sent[0]!.url.searchParams.get('a')!))).toEqual({ q: 'an' });
    expect(seen.ctx!.args).toEqual({ q: 'an' });
    expect(seen.ctx!.query).toEqual({ page: 2 });

    await search({ q: 'x' });
    expect(sent[1]!.url.searchParams.has('page')).toBe(false);
    expect(seen.ctx!.query).toEqual({});
  });

  it('a GET with a form sends its value in ?a=', async () => {
    const f = person();
    const args = formTypes(f.$schema);
    const spec: FnSpec = { id: 'routes/usuarios', name: 'find', method: 'GET', form: f, args, chain: [], wire: binWire };
    const server = fn(spec);
    server.handle(record());
    const sent = served(server);
    const find = stub<never, unknown, typeof f>(spec);
    f.$set({ name: 'Ana', age: 30 });
    await find(f);
    expect(binWire.decodeArgs(args, fromBase64url(sent[0]!.url.searchParams.get('a')!))).toEqual({ name: 'Ana', age: 30 });
    expect((seen.ctx!['form'] as typeof f).$value()).toEqual({ name: 'Ana', age: 30 });
  });

  it('a function without arguments sends no body and its 204 is undefined', async () => {
    const spec: FnSpec = { id: 'routes/usuarios', name: 'clear', method: 'DELETE', chain: [], wire: binWire };
    const server = fn(spec);
    server.handle(() => undefined);
    const sent = served(server);
    const clear = stub<never, void, void>(spec);
    expect(await clear()).toBeUndefined();
    expect(sent[0]!.init.body).toBeUndefined();
    expect(sent[0]!.url.pathname).toBe('/_fudic/fn/routes/usuarios/clear');
  });

  it('a date argument crosses as a Date', async () => {
    const spec: FnSpec = { id: 'routes/agenda', name: 'move', method: 'POST', route: ['day', ':on'], params: { on: 'date' }, args: { at: 'date' }, chain: [], wire: binWire };
    const server = fn(spec);
    server.handle(record());
    const sent = served(server);
    const move = stub<never, unknown, { on: Date; at: Date }>(spec);
    const on = new Date('2026-10-21T00:00:00.000Z');
    await move({ on, at: on });
    expect(sent[0]!.url.pathname).toBe('/_fudic/fn/routes/agenda/move/day/2026-10-21T00%3A00%3A00.000Z');
    expect(seen.ctx!.params).toEqual({ on });
    expect(seen.ctx!.args).toEqual({ at: on });
  });

  it('options.params names the page; base prefixes the URL', async () => {
    const server = fn(blogSave({ base: '/app/' }));
    server.handle(record());
    const sent = served(server);
    at('/app/blog/otro');
    const save = stub<never, unknown, { id: number; notify: boolean; active: boolean }>(blogSave({ base: '/app/' }));
    await save({ id: 1, notify: true, active: true }, { params: { slug: 'elegido' } });
    expect(sent[0]!.url.pathname).toBe('/app/_fudic/fn/routes/blog/elegido/save/1');
  });
});

describe('criterion 15: a form alone, with the adds of its chain', () => {
  it('save(form) reaches the handler with ctx.user from auth and ctx.form validated', async () => {
    const auth = middleware<{}, { user: string }>({ id: 'middlewares/auth', name: 'auth', server: true });
    auth.server((ctx, next) => next(Object.assign(ctx, { user: 'ana' })));
    const f = person();
    const spec: FnSpec = { id: 'components/user-form', name: 'save', method: 'PUT', form: f, args: formTypes(f.$schema), returns: 'str', chain: [{ steps: [{ use: [use(auth)] }] }], wire: binWire };
    const server = fn(spec);
    server.handle(record());
    const sent = served(server);
    const save = stub<never, unknown, typeof f>(spec);
    at('/usuarios');
    f.$set({ name: 'Eva', age: 40 });

    expect(await save(f)).toBe('ok');
    expect(sent[0]!.url.pathname).toBe('/_fudic/fn/components/user-form/save');
    expect(seen.ctx!['user']).toBe('ana');
    expect((seen.ctx!['form'] as typeof f).$value()).toEqual({ name: 'Eva', age: 40 });
  });

  it('an invalid form is refused in the browser with a 422 and nothing is sent', async () => {
    const f = person();
    const spec: FnSpec = { id: 'components/user-form', name: 'save', method: 'PUT', form: f, chain: [], wire: binWire };
    const sent = served(fn(spec));
    const save = stub<never, unknown, typeof f>(spec);
    const error = await save(f).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).errors).toEqual({ name: { required: true }, age: { required: true } });
    expect(sent).toHaveLength(0);
  });
});

describe('criterion 37: the types on the wire, both sides', () => {
  const uuidSpec = (): FnSpec => ({ id: 'routes/items', name: 'get', method: 'GET', route: [':id'], params: { id: 'uuid' }, chain: [], wire: binWire });

  it('a uuid in any case is accepted; a str accepts abc', async () => {
    const server = fn(uuidSpec());
    server.handle(record());
    served(server);
    const get = stub<never, unknown, { id: string }>(uuidSpec());
    at('/items');
    await get({ id: ID.toUpperCase() });
    expect(seen.ctx!.params).toEqual({ id: ID.toUpperCase() });

    const text: FnSpec = { ...uuidSpec(), id: 'routes/texts', params: { id: 'str' } };
    const textServer = fn(text);
    textServer.handle(record());
    served(textServer);
    await stub<never, unknown, { id: string }>(text)({ id: 'abc' });
    expect(seen.ctx!.params).toEqual({ id: 'abc' });
  });

  it('in the browser, a bad uuid or i32 rejects with the 400 Problem and sends nothing', async () => {
    const sent = served(fn(uuidSpec()));
    const get = stub<never, unknown, { id: string }>(uuidSpec());
    const e1 = (await get({ id: 'abc' }).catch((e: unknown) => e)) as HttpError;
    expect(e1).toBeInstanceOf(HttpError);
    expect(e1.problem).toEqual({ status: 400, title: 'Bad Request', detail: 'argument id is not a valid uuid' });

    // Untyped on purpose: what a caller without TS (or with a cast) can send.
    const save = stub<never, unknown, { id: unknown; notify: unknown; active: unknown }>(blogSave());
    const e2 = (await save({ id: 'abc', notify: true, active: true }).catch((e: unknown) => e)) as HttpError;
    expect(e2.problem.detail).toBe('argument id is not a valid i32');
    const e3 = (await save({ id: 1, notify: 'yes', active: true }).catch((e: unknown) => e)) as HttpError;
    expect(e3.problem.detail).toBe('argument notify is not a valid bool');
    const e4 = (await save({ id: 1, notify: true, active: 3 }).catch((e: unknown) => e)) as HttpError;
    expect(e4.problem.detail).toBe('argument active is not a valid bool');
    expect(sent).toHaveLength(0);
  });

  it('on the server, the same values are a 400 with Problem naming the argument', async () => {
    const server = fn(blogSave({ wire: jsonWire }));
    server.handle(record());
    const call = async (path: string, body: unknown = { active: true }) => {
      const request = new Request(`${ORIGIN}${path}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const id = path.split('?')[0]!.split('/').at(-1)!;
      const response = await serve({ request, contract: server, page: { slug: 'p' }, route: { id } });
      return { status: response.status, problem: (await response.json()) as { detail?: string } };
    };
    expect(await call('/_fudic/fn/routes/blog/p/save/abc?notify=true')).toMatchObject({ status: 400, problem: { detail: 'argument id is not a valid i32' } });
    expect(await call('/_fudic/fn/routes/blog/p/save/1?notify=si')).toMatchObject({ status: 400, problem: { detail: 'argument notify is not a valid bool' } });
    expect(await call('/_fudic/fn/routes/blog/p/save/1')).toMatchObject({ status: 400, problem: { detail: 'argument notify is missing' } });
    expect(await call('/_fudic/fn/routes/blog/p/save/1?notify=true', { active: 'x' })).toMatchObject({
      status: 400,
      problem: { detail: 'argument active is not a valid bool' },
    });
    expect(seen.ctx).toBeUndefined();

    const uuidServer = fn(uuidSpec());
    uuidServer.handle(record());
    const response = await serve({ request: new Request(`${ORIGIN}/_fudic/fn/routes/items/get/abc`), contract: uuidServer, page: {}, route: { id: 'abc' } });
    expect(response.status).toBe(400);
    expect(await binProblem(response)).toMatchObject({ detail: 'argument id is not a valid uuid' });
  });

  it('a route value the dispatcher could not read is missing', async () => {
    const server = fn(blogSave());
    server.handle(record());
    const response = await serve({
      request: new Request(`${ORIGIN}/x?notify=true`, { method: 'PUT' }),
      contract: server,
      page: {},
      route: {},
    });
    expect(response.status).toBe(400);
    expect(await binProblem(response)).toMatchObject({ detail: 'argument id is missing' });
  });
});

describe('criterion 16 and the other answers of serve', () => {
  const plain = (): FnSpec => ({ id: 'components/user-form', name: 'save', method: 'PUT', returns: 'str', chain: [], wire: binWire });
  const put = () => new Request(`${ORIGIN}/_fudic/fn/components/user-form/save`, { method: 'PUT' });

  it('without .handle: 404 with Problem; the detail names it only in dev', async () => {
    const server = fn(plain());
    const dev = await serve({ request: put(), contract: server, page: {}, route: {} }, { dev: true });
    expect(dev.status).toBe(404);
    expect(await binProblem(dev)).toMatchObject({
      status: 404,
      detail: 'save of components/user-form has no implementation in src/server',
    });
    const prod = await serve({ request: put(), contract: server, page: {}, route: {} });
    expect(prod.status).toBe(404);
    expect(await binProblem(prod)).not.toHaveProperty('detail');
  });

  it('the wrong verb is a 405', async () => {
    const server = fn(plain());
    server.handle(record());
    const response = await serve({ request: new Request(`${ORIGIN}/x`), contract: server, page: {}, route: {} });
    expect(response.status).toBe(405);
  });

  it('what is not an HttpError is told to onError and answered 500', async () => {
    const server = fn(plain());
    server.handle(() => {
      throw new Error('boom');
    });
    const onError = vi.fn();
    const response = await serve({ request: put(), contract: server, page: {}, route: {} }, { onError });
    expect(response.status).toBe(500);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
  });

  it('an HttpError the handler throws is its answer, and onError is not told', async () => {
    const server = fn(plain());
    server.handle(() => {
      throw new HttpError({ status: 409, title: 'Conflict', detail: 'reserved' });
    });
    const onError = vi.fn();
    const response = await serve({ request: put(), contract: server, page: {}, route: {} }, { onError });
    expect(response.status).toBe(409);
    expect(onError).not.toHaveBeenCalled();
  });

  it('the handler resolves from the container the options make', async () => {
    const server = fn(plain());
    server.handle(record());
    const container = vi.fn(() => createRoot());
    const response = await serve({ request: put(), contract: server, page: {}, route: {} }, { container });
    expect(response.status).toBe(200);
    expect(container).toHaveBeenCalledOnce();
  });
});

describe('the two variants', () => {
  it('the server variant is registered by <id>; calling it is a mistake', async () => {
    const server = fn({ id: 'components/registered', name: 'save', method: 'PUT', chain: [], wire: binWire });
    expect(contractsOf('components/registered').get('save')).toBe(server);
    expect(contractsOf('components/none').size).toBe(0);
    await expect((server as unknown as () => Promise<unknown>)()).rejects.toThrow('save of components/registered is called from the browser');
  });

  it('.handle in the browser is always the wrong folder', () => {
    const save = stub({ id: 'components/user-form', name: 'save', method: 'PUT', chain: [], wire: binWire });
    expect(() => save.handle(() => 1)).toThrow('save of components/user-form must be implemented in src/server');
  });
});

describe('pathOf', () => {
  it('fills the page in <id> and the route behind the name', () => {
    expect(pathOf({ id: 'routes/blog/[slug]', name: 'save', route: [':id'] }, { slug: 'mi post' }, { id: 42 })).toBe(
      '/_fudic/fn/routes/blog/mi%20post/save/42',
    );
    expect(pathOf({ id: 'routes/a/[x]', name: 'f', route: ['lines', ':line'] }, {}, { line: 3 })).toBe('/_fudic/fn/routes/a//f/lines/3');
    expect(pathOf({ id: 'components/c', name: 'f' }, {}, {})).toBe('/_fudic/fn/components/c/f');
  });
});

describe('invalidates', () => {
  it('a write invalidates its page and what it names; a GET only what it names', async () => {
    const posted: unknown[] = [];
    vi.stubGlobal('navigator', {
      serviceWorker: {
        controller: {
          postMessage: (message: unknown, [port]: MessagePort[]) => {
            posted.push(message);
            port!.postMessage('done');
          },
        },
      },
    });
    const write: FnSpec = { id: 'routes/usuarios', name: 'save', method: 'POST', invalidates: ['/blog/:slug'], chain: [], wire: binWire };
    const read: FnSpec = { id: 'routes/usuarios', name: 'list', method: 'GET', invalidates: ['/x'], chain: [], wire: binWire };
    for (const spec of [write, read]) {
      const server = fn(spec);
      server.handle(() => 1);
    }
    vi.stubGlobal('fetch', async () => new Response('1', { status: 200, headers: { 'content-type': 'application/json' } }));
    at('/usuarios');
    await stub<never, number, void>(write)();
    await stub<never, number, void>(read)();
    expect(posted).toEqual([
      expect.objectContaining({ paths: ['/usuarios', '/blog/:slug'] }),
      expect.objectContaining({ paths: ['/x'] }),
    ]);
  });
});

describe('criterion 7: a problem in fud-bin is the class the server threw', () => {
  const plain = (over: Partial<FnSpec> = {}): FnSpec => ({ id: 'routes/usuarios', name: 'save', method: 'PUT', chain: [], wire: binWire, ...over });

  it('a 404 is an HttpError with its detail', async () => {
    const server = fn(plain());
    server.handle(() => {
      throw notFound('no such user');
    });
    served(server);
    const e = await stub<never, unknown, void>(plain())().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(HttpError);
    expect((e as HttpError).status).toBe(404);
    expect((e as HttpError).problem.detail).toBe('no such user');
  });

  it('a 422 of a form is a ValidationError with its errors', async () => {
    const taken = serverValidator<string>((v) => (v === 'ana' ? { taken: true } : null));
    const f = formOf({ name: str('', [taken]) });
    const spec = plain({ form: f, args: formTypes(f.$schema) });
    fn(spec).handle(() => undefined);
    served(contractsOf('routes/usuarios').get('save')!);
    f.$set({ name: 'ana' });
    const e = await stub<never, unknown, typeof f>(spec)(f).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ValidationError);
    expect((e as ValidationError).errors).toEqual({ name: { taken: true } });
    expect((e as ValidationError).summary).toBeNull();
  });

  it('a Redirect keeps its location', async () => {
    const server = fn(plain());
    server.handle(() => {
      throw redirect('/login');
    });
    served(server);
    const e = await stub<never, unknown, void>(plain())().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Redirect);
    expect((e as Redirect).location).toBe('/login');
  });
});

describe('criterion 4: dates', () => {
  const spec = (wire: FnSpec['wire']): FnSpec => ({ id: 'routes/agenda', name: 'when', method: 'PUT', args: { at: 'date' }, returns: 'date', chain: [], wire });

  it.each([
    ['fud-bin', binWire],
    ['use json', jsonWire],
  ] as const)('%s: a -> date comes back a Date', async (_, wire) => {
    const server = fn(spec(wire));
    server.handle((ctx: { args: { at: Date } }) => new Date(ctx.args.at.getTime() + 1));
    served(server);
    const at = new Date('2026-10-21T10:00:00.000Z');
    const back = await stub<never, unknown, { at: Date }>(spec(wire))({ at });
    expect(back).toBeInstanceOf(Date);
    expect((back as Date).getTime()).toBe(at.getTime() + 1);
  });

  it.each([
    ['fud-bin', binWire],
    ['use json', jsonWire],
  ] as const)('%s: a date past 48 bits never leaves the browser', async (_, wire) => {
    const sent = served(fn(spec(wire)));
    // 2^47 ms after 1970 is in the year 6429: the year 7000 does not fit.
    for (const at of [new Date('7000-01-01T00:00:00.000Z'), new Date(-(2 ** 47))]) {
      const e = await stub<never, unknown, { at: Date }>(spec(wire))({ at }).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).problem).toEqual({ status: 400, title: 'Bad Request', detail: 'argument at is not a valid date' });
    }
    expect(sent).toHaveLength(0);
  });
});

describe('criterion 11: a GET with use json', () => {
  it('sends its arguments in ?a= as JSON, and reads its value as JSON', async () => {
    const spec: FnSpec = { id: 'routes/usuarios', name: 'search', method: 'GET', args: { q: 'str' }, returns: { list: 'str' }, chain: [], wire: jsonWire };
    const server = fn(spec);
    server.handle(record(['Ana']));
    const sent = served(server);
    expect(await stub<never, string[], { q: string }>(spec)({ q: 'an' })).toEqual(['Ana']);
    expect(JSON.parse(sent[0]!.url.searchParams.get('a')!)).toEqual({ q: 'an' });
    expect(headersOf(sent[0]!.init).has('fud-sig')).toBe(false);
  });
});

describe('a call waits for the browser root (SDD-67: the race after hydration)', () => {
  it('a client half the root registers after the call starts still runs, before the request', async () => {
    const trace: string[] = [];
    const log = middleware({ id: 'middlewares/log', name: 'log', client: true });
    const spec: FnSpec = {
      id: 'routes/usuarios',
      name: 'ping',
      method: 'GET',
      returns: 'str',
      chain: [{ steps: [{ use: [use(log)] }] }],
      wire: binWire,
    };
    const server = fn(spec);
    server.handle(() => {
      trace.push('server');
      return 'pong';
    });
    served(server);
    const ping = stub<never, string, void>(spec);

    // The root is still importing src/browser: the half arrives a turn later.
    let release!: () => void;
    const loaded = new Promise<void>((r) => (release = r));
    const root = inTurn(async () => {
      await loaded;
      log.client((ctx, next) => {
        trace.push('client half');
        return next(ctx);
      });
    });

    const answer = ping();
    await Promise.resolve();
    expect(trace).toEqual([]);
    release();
    await root;
    expect(await answer).toBe('pong');
    expect(trace).toEqual(['client half', 'server']);
  });
});
