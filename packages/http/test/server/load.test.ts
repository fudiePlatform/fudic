/**
 * SDD-56 §3.2, §4.4 and criterion 14: the `ctx` of `load` and `withRequest`, the container of
 * the request that `inject()` and `publish()` find without a `ctx`. `load` through its chain is
 * `contract/server.ts`'s since SDD-60.
 */

import { describe, expect, it, vi } from 'vitest';
import { createRoot, inject, publish, seedOf, Service, token } from '@fudic/di';
import { pageContext } from '../../src/server/load.js';
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
      withRequest(rootA, () => load(ctxOf('a', '20'))),
      withRequest(rootB, () => load(ctxOf('b', '1'))),
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
        'noFunction',
        'pageContext',
        'parseCookies',
        'problemOf',
        'problemResponse',
        'withRequest',
      ].sort(),
    );
  });
});
