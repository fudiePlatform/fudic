/**
 * SDD-60 §3.4, §4.4 — `load`, `paths` and `layout`: pieces only `src/server` implements, and a
 * `load` without one is a 404 of the page.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { loadingFile, middleware, page, resetRegistry, use } from '../../src/contract/index.js';
import { runLoad } from '../../src/contract/server.js';
import { HttpError } from '../../src/errors.js';
import { serverCtx } from '../helpers.js';

afterEach(() => {
  loadingFile(undefined);
  resetRegistry();
});

describe('a page piece', () => {
  it('load.handle registers it; the browser variant refuses', () => {
    const load = page<() => unknown>({ id: 'routes/usuarios', name: 'load' });
    const fn = () => ({ users: [] });
    load.handle(fn);
    expect(load.slot.get()).toBe(fn);
    const never = page<() => unknown>({ id: 'routes/usuarios', name: 'paths', browser: true });
    expect(() => never.handle(fn)).toThrow('paths of routes/usuarios must be implemented in src/server');
  });

  it('in src/browser it is the wrong folder', () => {
    const layout = page<() => unknown>({ id: 'routes/blog', name: 'layout' });
    loadingFile('browser', 'src/browser/blog.ts');
    expect(() => layout.handle(() => 1)).toThrow('layout of routes/blog must be implemented in src/server: src/browser/blog.ts');
  });
});

describe('runLoad', () => {
  it('runs load through the server halves of its chain', async () => {
    const seen: string[] = [];
    const auth = middleware<{}, { user: string }>({ id: 'middlewares/auth', name: 'auth', server: true });
    auth.server((ctx, next) => next(Object.assign(ctx, { user: 'ana' })));
    const load = page<(ctx: never) => unknown>({ id: 'routes/usuarios', name: 'load', chain: [{ steps: [{ use: [use(auth)] }] }] });
    load.handle(((ctx: { user: string }) => {
      seen.push(ctx.user);
      return { users: ['Ana'] };
    }) as never);
    expect(await runLoad(load, serverCtx('GET'))).toEqual({ users: ['Ana'] });
    expect(seen).toEqual(['ana']);
  });

  it('what it gives is data: a TrustedHTML arrives as its text, at any depth (SDD-61 §4.7)', async () => {
    const load = page<(ctx: never) => unknown>({ id: 'routes/x', name: 'load' });
    const when = new Date(0);
    const bare = Object.create(null) as Record<string, unknown>;
    bare['h'] = { fudicTrustedHtml: '<b>a</b>' };
    load.handle(() => ({ cuerpo: { fudicTrustedHtml: '<p>x</p>' }, lista: [{ fudicTrustedHtml: '<i>y</i>' }, 'z'], when, bare, n: null }));
    expect(await runLoad(load, serverCtx('GET'))).toEqual({ cuerpo: '<p>x</p>', lista: ['<i>y</i>', 'z'], when, bare: { h: '<b>a</b>' }, n: null });
  });

  it('without a chain it is just the handler', async () => {
    const load = page<(ctx: never) => unknown>({ id: 'routes/x', name: 'load' });
    load.handle(() => 7);
    expect(await runLoad(load, serverCtx('GET'))).toBe(7);
  });

  it('without an implementation the page is a 404, with what is missing only in dev', async () => {
    const load = page<(ctx: never) => unknown>({ id: 'routes/usuarios', name: 'load' });
    const dev = (await runLoad(load, serverCtx('GET'), true).catch((e: unknown) => e)) as HttpError;
    expect(dev).toBeInstanceOf(HttpError);
    expect(dev.status).toBe(404);
    expect(dev.problem.detail).toBe('load of routes/usuarios has no implementation in src/server');
    const prod = (await runLoad(load, serverCtx('GET')).catch((e: unknown) => e)) as HttpError;
    expect(prod.status).toBe(404);
    expect(prod.problem.detail).toBeUndefined();
  });
});
