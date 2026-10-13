/**
 * SDD-56 §4.7 and criteria 21–25: the stub `$fn`, end to end.
 *
 * `fetch` is the real server: it hands the `Request` the stub built to `dispatch`, so what is
 * checked is what a page sees — the value `handle` returned, or the error it threw, rebuilt.
 * `location` is stubbed with the page the browser is on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { control, form, serverValidator } from '@fudic/forms';
import { $fn, fill, isForm, join, pageParams, type FnSpec } from '../../src/client/fn.js';
import { chain, levelOfChain } from '../../src/chain.js';
import { get, put, del } from '../../src/builder.js';
import { middleware } from '../../src/middleware.js';
import { csrf } from '../../src/csrf.js';
import { HttpError, Redirect, ValidationError, notFound, redirect } from '../../src/errors.js';
import { dispatch, type FnTarget } from '../../src/server/dispatch.js';
import type { ServerFn } from '../../src/builder.js';
import type { ChainBuilder } from '../../src/chain.js';

const ORIGIN = 'https://app.test';

/** The browser is on `pathname`. */
function at(pathname: string): void {
  vi.stubGlobal('location', { origin: ORIGIN, pathname });
}

interface Sent {
  readonly url: URL;
  readonly init: RequestInit;
}

/** `fetch` that serves `fn` through `dispatch`, recording what it was sent. */
function serve(fn: ServerFn<unknown, unknown>, global?: ChainBuilder): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    sent.push({ url, init });
    const target: FnTarget = {
      name: 'x',
      fn,
      params: {},
      ...(global !== undefined ? { global } : {}),
    };
    return dispatch(new Request(url, init), target);
  });
  return sent;
}

const spec = (over: Partial<FnSpec> & Pick<FnSpec, 'method'>): FnSpec => ({
  name: 'search',
  url: '/_fudic/fn/r/usuarios/search',
  page: '/usuarios',
  chain: [],
  ...over,
});

beforeEach(() => at('/usuarios'));
afterEach(() => vi.unstubAllGlobals());

describe('criterion 21: a GET', () => {
  it('await search({ q: "ana" }) is GET …/search?a=… and returns what handle returned', async () => {
    const sent = serve(get().args<{ q: string }>().handle((ctx) => [{ name: ctx.args.q }]));
    const search = $fn<{ q: string }, { name: string }[]>(spec({ method: 'GET' }));

    expect(await search({ q: 'ana' })).toEqual([{ name: 'ana' }]);
    expect(sent).toHaveLength(1);
    const { url, init } = sent[0]!;
    expect(init.method).toBe('GET');
    expect(url.origin + url.pathname).toBe(`${ORIGIN}/_fudic/fn/r/usuarios/search`);
    expect(JSON.parse(url.searchParams.get('a')!)).toEqual({ q: 'ana' });
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe('same-origin');
  });

  it('without arguments there is no ?a=', async () => {
    const sent = serve(get().handle(() => 3));
    const list = $fn<void, number>(spec({ method: 'GET' }));
    expect(await list()).toBe(3);
    expect(sent[0]!.url.search).toBe('');
  });

  it('a form passed to a GET travels as its value with keys', async () => {
    const sent = serve(get().handle((ctx) => ctx.args));
    const f = form({ q: control('ana') });
    expect(await $fn<any, unknown>(spec({ method: 'GET' }))(f)).toEqual({ q: 'ana' });
    expect(JSON.parse(sent[0]!.url.searchParams.get('a')!)).toEqual({ q: 'ana' });
  });
});

describe('the rest of the verbs', () => {
  it('a PUT sends its args as JSON with content-type and resolves the value', async () => {
    const sent = serve(put().handle((ctx) => ({ got: ctx.args })));
    const save = $fn<{ id: number }, unknown>(spec({ method: 'PUT', name: 'save', url: '/_fudic/fn/r/usuarios/save' }));
    expect(await save({ id: 7 })).toEqual({ got: { id: 7 } });
    const { init } = sent[0]!;
    expect(init.method).toBe('PUT');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(init.body).toBe('{"id":7}');
  });

  it('a DELETE without args sends no body, and a 204 resolves undefined', async () => {
    const sent = serve(del().handle(() => undefined));
    expect(await $fn<any, unknown>(spec({ method: 'DELETE' }))()).toBeUndefined();
    expect(sent[0]!.init.body).toBeUndefined();
  });
});

describe('criterion 22: a form that does not validate', () => {
  it('throws ValidationError and makes no request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const f = form({ name: control('', [(v: string) => (v === '' ? { required: true } : null)]) });
    const e = await $fn<any, unknown>(spec({ method: 'PUT' }))(f).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ValidationError);
    expect((e as ValidationError).status).toBe(422);
    expect((e as ValidationError).errors).toEqual({ name: { required: true } });
    expect((e as ValidationError).summary).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('a valid form goes out, as its value with keys when the function has no .form', async () => {
    const sent = serve(put().handle((ctx) => ctx.args));
    const f = form({ name: control('Pedro') });
    expect(await $fn<any, unknown>(spec({ method: 'PUT' }))(f)).toEqual({ name: 'Pedro' });
    expect(sent[0]!.init.body).toBe('{"name":"Pedro"}');
  });
});

describe('criterion 23: errors come back as the class the server threw', () => {
  it('404 rejects with HttpError 404 and its problem', async () => {
    serve(put().handle(() => { throw notFound('x'); }));
    const e = await $fn<any, unknown>(spec({ method: 'PUT' }))({}).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(HttpError);
    expect(e).not.toBeInstanceOf(ValidationError);
    expect((e as HttpError).status).toBe(404);
    expect((e as HttpError).problem).toEqual({ status: 404, title: 'Not Found', detail: 'x' });
  });

  it('422 rejects with ValidationError and its errors', async () => {
    const taken = serverValidator<string>((v) => (v === 'ana' ? { taken: true } : null));
    const userForm = form({ name: control('', [taken]) });
    serve(put().form(userForm).handle(() => 1));
    const e = await $fn<any, unknown>(spec({ method: 'PUT' }))({ name: 'ana' }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ValidationError);
    expect((e as ValidationError).errors).toEqual({ name: { taken: true } });
  });

  it('303 rejects with Redirect and its location', async () => {
    serve(put().handle(() => { throw redirect('/login'); }));
    const e = await $fn<any, unknown>(spec({ method: 'PUT' }))({}).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Redirect);
    expect((e as Redirect).status).toBe(303);
    expect((e as Redirect).location).toBe('/login');
  });

  it('a 500 is an HttpError 500', async () => {
    serve(put().handle(() => { throw new Error('secreto'); }));
    const e = await $fn<any, unknown>(spec({ method: 'PUT' }))({}).catch((x: unknown) => x);
    expect((e as HttpError).status).toBe(500);
    expect((e as HttpError).message).not.toContain('secreto');
  });
});

describe('criterion 24: cancel', () => {
  it('aborting options.signal rejects with the AbortError, unwrapped, and aborts the fetch', async () => {
    let seen: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      (_: URL, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          seen = init.signal!;
          init.signal!.addEventListener('abort', () => reject(init.signal!.reason));
        }),
    );
    const controller = new AbortController();
    const p = $fn<any, unknown>(spec({ method: 'GET' }))(undefined, { signal: controller.signal });
    await new Promise((r) => setTimeout(r, 1));
    controller.abort();
    const e = await p.catch((x: unknown) => x);
    expect(e).toBeInstanceOf(DOMException);
    expect((e as DOMException).name).toBe('AbortError');
    expect(seen!.aborted).toBe(true);
  });

  it('without options.signal, the signal never aborts', async () => {
    let seen: AbortSignal | undefined;
    vi.stubGlobal('fetch', async (_: URL, init: RequestInit) => {
      seen = init.signal!;
      return new Response(null, { status: 204 });
    });
    await $fn<any, unknown>(spec({ method: 'GET' }))();
    expect(seen).toBeInstanceOf(AbortSignal);
    expect(seen!.aborted).toBe(false);
  });
});

describe('criterion 25: the params of a route function', () => {
  const blog = (over: Partial<FnSpec> = {}) =>
    spec({ method: 'GET', url: '/_fudic/fn/r/blog/:slug/save', page: '/blog/:slug', ...over });

  it('without options.params, the page the browser is on', async () => {
    at('/blog/hola');
    const sent = serve(get().handle(() => 1));
    await $fn<any, unknown>(blog())();
    expect(sent[0]!.url.pathname).toBe('/_fudic/fn/r/blog/hola/save');
  });

  it('with options.params, those', async () => {
    at('/blog/hola');
    const sent = serve(get().handle(() => 1));
    await $fn<any, unknown>(blog())(undefined, { params: { slug: 'otra' } });
    expect(sent[0]!.url.pathname).toBe('/_fudic/fn/r/blog/otra/save');
  });

  it('a param is decoded off the page and encoded into the URL', async () => {
    at('/blog/a%20b');
    const sent = serve(get().handle(() => 1));
    await $fn<any, unknown>(blog())();
    expect(sent[0]!.url.pathname).toBe('/_fudic/fn/r/blog/a%20b/save');
  });

  it('with a base, both the page and the function URL carry it', async () => {
    at('/app/blog/hola');
    const sent = serve(get().handle(() => 1));
    await $fn<any, unknown>(blog({ base: '/app/' }))();
    expect(sent[0]!.url.pathname).toBe('/app/_fudic/fn/r/blog/hola/save');
  });

  it('on a page that is not the pattern and without params, the call is a TypeError', async () => {
    at('/otra/cosa/mas');
    vi.stubGlobal('fetch', vi.fn());
    await expect($fn<any, unknown>(blog())()).rejects.toThrow(TypeError);
  });

  it('a component function has no page and no params', async () => {
    at('/cualquiera/sitio');
    const sent = serve(put().handle(() => 1));
    await $fn<any, unknown>(spec({ method: 'PUT', url: '/_fudic/fn/c/user-form/save', page: undefined as never }))({});
    expect(sent[0]!.url.pathname).toBe('/_fudic/fn/c/user-form/save');
  });
});

describe('the chain on the client', () => {
  it('runs the client halves of every level, outside in, and never a server half', async () => {
    const trace: string[] = [];
    const mw = (name: string) =>
      middleware()
        .client((ctx, next) => (trace.push(name), next(ctx)))
        .server((ctx, next) => (trace.push(`server:${name}`), next(ctx)));
    vi.stubGlobal('fetch', async () => new Response(null, { status: 204 }));
    const call = $fn<any, unknown>(
      spec({
        method: 'GET',
        chain: [chain().use(mw('global')), levelOfChain(chain().use(mw('file'))), get().use(mw('fn')).handle(() => 0).level],
      }),
    );
    await call();
    expect(trace).toEqual(['global', 'file', 'fn']);
  });

  it('a header a middleware sets reaches the request', async () => {
    const sent = serve(get().handle((ctx) => ctx.headers.get('authorization')));
    const auth = middleware().client((ctx, next) => {
      ctx.headers.set('authorization', 'Bearer t');
      return next(ctx);
    });
    expect(await $fn<any, unknown>(spec({ method: 'GET', chain: [chain().use(auth)] }))()).toBe('Bearer t');
    expect(new Headers(sent[0]!.init.headers).get('authorization')).toBe('Bearer t');
  });

  it('a middleware reads the value next returned, and sees ctx with name, method and url', async () => {
    serve(get().handle(() => 41));
    let seen: { name: string; method: string; url: string; side: string } | undefined;
    const plus = middleware().client(async (ctx, next) => {
      seen = { name: ctx.name, method: ctx.method, url: ctx.url.pathname, side: ctx.side };
      return ((await next(ctx)) as number) + 1;
    });
    expect(await $fn<any, unknown>(spec({ method: 'GET', chain: [chain().use(plus)] }))()).toBe(42);
    expect(seen).toEqual({ name: 'search', method: 'GET', url: '/_fudic/fn/r/usuarios/search', side: 'client' });
  });

  it('criterion 35: a call from the stub passes csrf', async () => {
    const global = chain().use(csrf);
    serve(put().handle(() => 'ok'), global);
    expect(await $fn<any, unknown>(spec({ method: 'PUT', chain: [global] }))({})).toBe('ok');
  });

  it('criterion 35: without csrf on the client, the server half refuses it', async () => {
    serve(put().handle(() => 'ok'), chain().use(csrf));
    await expect($fn<any, unknown>(spec({ method: 'PUT' }))({})).rejects.toMatchObject({ status: 403 });
  });
});

describe('the helpers', () => {
  it('isForm', () => {
    expect(isForm(form({ a: control('') }))).toBe(true);
    expect(isForm({ $validate: 1 })).toBe(false);
    expect(isForm(null)).toBe(false);
    expect(isForm('x')).toBe(false);
  });

  it('pageParams', () => {
    expect(pageParams(undefined, '/', '/x')).toEqual({});
    expect(pageParams('/blog/:slug', '/', '/blog/a')).toEqual({ slug: 'a' });
    expect(pageParams('/blog/:slug', '/', '/blog')).toEqual({});
    expect(pageParams('/a/:x/b/:y', '/base/', '/base/a/1/b/2')).toEqual({ x: '1', y: '2' });
  });

  it('fill', () => {
    expect(fill('/r/blog/:slug/save', { slug: 'a/b' })).toBe('/r/blog/a%2Fb/save');
    expect(fill('/c/x/save', {})).toBe('/c/x/save');
    expect(() => fill('/r/:id', {})).toThrow('missing param "id" for /r/:id');
  });

  it('join', () => {
    expect(join('/', '/a')).toBe('/a');
    expect(join('/app/', '/a')).toBe('/app/a');
    expect(join('/app', '/a')).toBe('/app/a');
  });
});
