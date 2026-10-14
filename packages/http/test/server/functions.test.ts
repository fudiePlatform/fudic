/**
 * SDD-56 §4.1 and §4.15: from a request under `/_fudic/fn` to the server function it names.
 *
 * The URL says whose function it is — `r/<the page's path>/<name>` or `c/<tag>/<name>` — and
 * the source says where its module is. What is not one of them is a 404 problem; the wrong
 * verb, a 405; anything else goes through `dispatch` with its three levels.
 */

import { describe, expect, it, vi } from 'vitest';
import { chain } from '../../src/chain.js';
import { get, put } from '../../src/builder.js';
import { middleware } from '../../src/middleware.js';
import { functionsHandler, type FnModule, type FnSource } from '../../src/server/functions.js';
import * as server from '../../src/server/index.js';

const ORIGIN = 'https://app.test';

function source(over: Partial<FnSource> = {}): FnSource & { calls: string[] } {
  const calls: string[] = [];
  const routes: Record<string, FnModule> = {
    '/': { hello: get().handle(() => 'home') },
    '/blog/:slug': {
      save: put().handle((ctx) => ({ slug: ctx.params['slug'], name: ctx.name })),
      load: get().handle(() => 'never'),
      helper: { not: 'a function' },
      half: { handle: () => 1 },
    },
    '/usuarios': {
      search: get().handle((ctx) => ({ args: ctx.args })),
    },
  };
  const components: Record<string, FnModule> = {
    'user-form': { save: put().handle((ctx) => ({ params: ctx.params })) },
  };
  return {
    calls,
    routes: Object.keys(routes),
    route: async (pattern) => (calls.push(`route ${pattern}`), routes[pattern]),
    component: async (tag) => (calls.push(`component ${tag}`), components[tag]),
    global: async () => undefined,
    ...over,
  };
}

const req = (path: string, method = 'GET', body?: string) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    ...(body !== undefined ? { body, headers: { 'content-type': 'application/json' } } : {}),
  });

describe('what is not under /_fudic/fn is someone else’s', () => {
  it('answers null', async () => {
    const handle = functionsHandler(source());
    expect(await handle(req('/usuarios'))).toBeNull();
    expect(await handle(req('/_fudic/data/usuarios'))).toBeNull();
    expect(await handle(req('/_fudic/fnord'))).toBeNull();
  });

  it('with a base, only under base + /_fudic/fn', async () => {
    const handle = functionsHandler(source(), { base: '/app/' });
    expect(await handle(req('/_fudic/fn/r/usuarios/search'))).toBeNull();
    expect((await handle(req('/app/_fudic/fn/r/usuarios/search')))!.status).toBe(200);
  });
});

describe('a route function', () => {
  it('r/<concrete path>/<name>: the params of its pattern, decoded', async () => {
    const res = (await functionsHandler(source())(req('/_fudic/fn/r/blog/a%20b/save', 'PUT')))!;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ slug: 'a b', name: 'save' });
  });

  it('the root route: r/<name>', async () => {
    const res = (await functionsHandler(source())(req('/_fudic/fn/r/hello')))!;
    expect(await res.json()).toBe('home');
  });

  it('its args travel as dispatch reads them', async () => {
    const a = encodeURIComponent(JSON.stringify({ q: 'ana' }));
    const res = (await functionsHandler(source())(req(`/_fudic/fn/r/usuarios/search?a=${a}`)))!;
    expect(await res.json()).toEqual({ args: { q: 'ana' } });
  });
});

describe('a component function', () => {
  it('c/<tag>/<name>, with no params', async () => {
    const s = source();
    const res = (await functionsHandler(s)(req('/_fudic/fn/c/user-form/save', 'PUT')))!;
    expect(await res.json()).toEqual({ params: {} });
    expect(s.calls).toEqual(['component user-form']);
  });

  it.each(['/_fudic/fn/c/user-form', '/_fudic/fn/c/user-form/x/save', '/_fudic/fn/c/'])('%s is 404', async (path) => {
    expect((await functionsHandler(source())(req(path, 'PUT')))!.status).toBe(404);
  });
});

describe('404 and 405', () => {
  const notFound = async (path: string, method = 'GET') => {
    const res = (await functionsHandler(source())(req(path, method)))!;
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    return res.json();
  };

  it('a path that is no route, an unknown kind, a trailing slash, nothing at all', async () => {
    expect(await notFound('/_fudic/fn/r/nada/save', 'PUT')).toEqual({
      status: 404,
      title: 'Not Found',
      detail: 'no such server function',
    });
    await notFound('/_fudic/fn/x/blog/a/save', 'PUT');
    await notFound('/_fudic/fn/r/blog/a/', 'PUT');
    await notFound('/_fudic/fn/');
  });

  it('load is never a server function', async () => {
    await notFound('/_fudic/fn/r/blog/a/load');
  });

  it('an export that is not a server function, or none, or a module that does not exist', async () => {
    await notFound('/_fudic/fn/r/blog/a/helper');
    await notFound('/_fudic/fn/r/blog/a/half');
    await notFound('/_fudic/fn/r/blog/a/nope');
    await notFound('/_fudic/fn/c/nobody/save', 'PUT');
  });

  it('another verb is 405', async () => {
    const res = (await functionsHandler(source())(req('/_fudic/fn/r/blog/a/save', 'POST', '{}')))!;
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ status: 405, title: 'Method Not Allowed' });
  });
});

describe('the three levels', () => {
  it('global from the source, file from the module’s http, then the function', async () => {
    const trace: string[] = [];
    const mw = (name: string) => middleware().server((ctx, next) => (trace.push(name), next(ctx)));
    const s = source({
      routes: ['/x'],
      route: async () => ({ http: chain().use(mw('file')), go: put().use(mw('fn')).handle(() => trace.push('handle')) }),
      global: async () => chain().use(mw('global')),
    });
    await functionsHandler(s)(req('/_fudic/fn/r/x/go', 'PUT'));
    expect(trace).toEqual(['global', 'file', 'fn', 'handle']);
  });

  it('dev and onError reach dispatch', async () => {
    const onError = vi.fn();
    const s = source({ routes: ['/x'], route: async () => ({ boom: get().handle(() => { throw new Error('secreto'); }) }) });
    const res = (await functionsHandler(s, { dev: true, onError })(req('/_fudic/fn/r/x/boom')))!;
    expect((await res.json()).detail).toBe('secreto');
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe('the ./server entry', () => {
  it('exports functionsHandler', () => {
    expect(server.functionsHandler).toBe(functionsHandler);
  });
});
