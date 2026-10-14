/**
 * SDD-56 §3.2, §4.4 and criteria 9 and 14 for `load`: the server halves of the global and
 * file levels, plus its own when it is fluent; never a client half. And `withRequest`, the
 * container of the request that `inject()` and `publish()` find without a `ctx`.
 */

import { describe, expect, it, vi } from 'vitest';
import { createRoot, inject, publish, seedOf, Service, token } from '@fudic/di';
import { chain } from '../../src/chain.js';
import { get } from '../../src/builder.js';
import { middleware } from '../../src/middleware.js';
import { pageContext, runLoad } from '../../src/server/load.js';
import { withRequest } from '../../src/server/request.js';
import { parseCookies, serverContext } from '../../src/server/context.js';
import * as server from '../../src/server/index.js';

const URL_PAGE = new URL('https://app.test/blog/a');
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Cart {
  static count = 0;
  readonly id = ++Cart.count;
}
Service(Cart);

const LINES = token<readonly string[]>('lines');

describe('pageContext', () => {
  it('is the page plus the server context of a GET named load', () => {
    const ctx = pageContext({ url: URL_PAGE, params: { slug: 'a' }, extra: 1 });
    expect(ctx.extra).toBe(1);
    expect(ctx.side).toBe('server');
    expect(ctx.method).toBe('GET');
    expect(ctx.name).toBe('load');
    expect(ctx.url).toBe(URL_PAGE);
    expect(ctx.params).toEqual({ slug: 'a' });
    expect(ctx.args).toBeUndefined();
  });

  it('without a request (the prerender): no headers, no cookies, a signal that never aborts', () => {
    const ctx = pageContext({ url: URL_PAGE, params: {} });
    expect([...ctx.headers]).toEqual([]);
    expect(ctx.cookies.size).toBe(0);
    expect(ctx.signal.aborted).toBe(false);
    expect(ctx.response.status).toBe(200);
  });

  it('with a request: its headers, its cookies and its signal', () => {
    const controller = new AbortController();
    const request = new Request(URL_PAGE, { headers: { cookie: 'sid=1' }, signal: controller.signal });
    const ctx = pageContext({ url: URL_PAGE, params: {}, request });
    expect(ctx.headers.get('cookie')).toBe('sid=1');
    expect(ctx.cookies.get('sid')).toBe('1');
    controller.abort();
    expect(ctx.signal.aborted).toBe(true);
  });
});

describe('runLoad', () => {
  const page = () => pageContext({ url: URL_PAGE, params: {} });

  it('a plain function load runs through global and file, server halves only', async () => {
    const trace: string[] = [];
    const mw = (name: string) =>
      middleware()
        .client(() => { trace.push(`client:${name}`); })
        .server((ctx, next) => (trace.push(name), next(ctx)));
    const load = vi.fn(() => ({ ok: 1 }));
    const value = await runLoad(load, { global: chain().use(mw('g')), file: chain().use(mw('f')) }, page());
    expect(value).toEqual({ ok: 1 });
    expect(trace).toEqual(['g', 'f']);
    expect(load).toHaveBeenCalledOnce();
  });

  it('a fluent load adds its own level and runs its handle', async () => {
    const trace: string[] = [];
    const own = middleware().server((ctx, next) => (trace.push('own'), next(ctx)));
    const global = chain().use(middleware().server((ctx, next) => (trace.push('g'), next(ctx))));
    const load = get().use(own).handle((ctx) => ({ name: ctx.name }));
    expect(await runLoad(load, { global }, page())).toEqual({ name: 'load' });
    expect(trace).toEqual(['g', 'own']);
  });

  it('criterion 9: no client half runs for load, nor a fluent one', async () => {
    const client = vi.fn();
    const both = middleware().client(client).server((ctx, next) => next(ctx));
    const load = get().use(both).handle(() => 1);
    await runLoad(load, { global: chain().use(both), file: chain().use(both) }, page());
    await runLoad(() => 2, { global: chain().use(both) }, page());
    expect(client).not.toHaveBeenCalled();
  });

  it('skip and skip("*") in the file level apply to load', async () => {
    const trace: string[] = [];
    const a = middleware().server((ctx, next) => (trace.push('a'), next(ctx)));
    await runLoad(() => 1, { global: chain().use(a), file: chain().skip('*') }, page());
    expect(trace).toEqual([]);
  });

  it('with no level at all, load is called with the ctx', async () => {
    const ctx = page();
    const load = vi.fn((c: unknown) => c);
    expect(await runLoad(load, {}, ctx)).toBe(ctx);
  });

  it('what load throws rejects', async () => {
    await expect(runLoad(() => { throw new Error('x'); }, {}, page())).rejects.toThrow('x');
  });
});

describe('withRequest', () => {
  it('returns what fn returns, and inject resolves from its container', () => {
    const root = createRoot();
    const cart = withRequest(root, () => inject(Cart));
    expect(withRequest(root, () => inject(Cart))).toBe(cart);
    expect(withRequest(createRoot(), () => inject(Cart))).not.toBe(cart);
  });

  it('outside it, inject finds no container', () => {
    withRequest(createRoot(), () => 0);
    expect(() => inject(Cart)).toThrow(/outside a factory/u);
  });

  it('criterion 14: two concurrent loads, each with its container and its own published values', async () => {
    const load = async (ctx: { readonly params: Readonly<Record<string, string>> }) => {
      const first = inject(Cart);
      await tick(Number(ctx.params['wait']));
      const second = inject(Cart);
      publish(LINES, [ctx.params['who']!]);
      return { first: first.id, second: second.id };
    };
    const rootA = createRoot();
    const rootB = createRoot();
    const ctxOf = (who: string, wait: string) => pageContext({ url: URL_PAGE, params: { who, wait } });

    const [a, b] = await Promise.all([
      withRequest(rootA, () => runLoad(load as never, {}, ctxOf('a', '20'))),
      withRequest(rootB, () => runLoad(load as never, {}, ctxOf('b', '1'))),
    ]);

    expect(a).toEqual({ first: (a as { first: number }).first, second: (a as { first: number }).first });
    expect(b).toEqual({ first: (b as { first: number }).first, second: (b as { first: number }).first });
    expect((a as { first: number }).first).not.toBe((b as { first: number }).first);
    expect(seedOf(rootA)).toEqual({ lines: ['a'] });
    expect(seedOf(rootB)).toEqual({ lines: ['b'] });
  });
});

describe('the context helpers', () => {
  it('serverContext gives each call its own response', () => {
    const input = { method: 'PUT', name: 'save', url: URL_PAGE, params: {}, args: { a: 1 } } as const;
    const one = serverContext(input);
    const two = serverContext(input);
    expect(one.args).toEqual({ a: 1 });
    expect(one.response).not.toBe(two.response);
    expect(one.response.headers).not.toBe(two.response.headers);
  });

  it('parseCookies: decoded values, trimmed names, = inside a value kept', () => {
    expect(Object.fromEntries(parseCookies(' a=1 ;b=hola%20mundo; c=x=y'))).toEqual({
      a: '1',
      b: 'hola mundo',
      c: 'x=y',
    });
  });

  it('parseCookies: a pair without = is skipped, an empty value kept', () => {
    expect(Object.fromEntries(parseCookies('flag; a=; b=2'))).toEqual({ a: '', b: '2' });
  });

  it('parseCookies: a broken escape is kept as written', () => {
    expect(parseCookies('bad=%E0%A4%A').get('bad')).toBe('%E0%A4%A');
  });

  it('parseCookies: no header is no cookies', () => {
    expect(parseCookies(null).size).toBe(0);
    expect(parseCookies('').size).toBe(0);
  });
});

describe('the ./server entry', () => {
  it('exports what the plugin and the adapters use', () => {
    expect(Object.keys(server).sort()).toEqual(
      [
        'PROBLEM_TYPE',
        'dispatch',
        'functionsHandler',
        'pageContext',
        'parseCookies',
        'problemOf',
        'problemResponse',
        'runLoad',
        'withRequest',
      ].sort(),
    );
  });
});
