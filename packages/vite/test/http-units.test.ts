/**
 * SDD-56 in the plugin, the pieces on their own: the functions middleware, and what a
 * navigation answers when `load` throws (§4.8).
 */

import { describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { fudic } from '../src/index.js';
import { fakeDevServerParts } from './helpers/dev-server.js';
import { ERROR_FILE } from '@fudic/conventions';
import {
  classifyError,
  backOf,
  ERROR_PATTERN,
  minimalErrorPage,
  pageOriginOf,
  problemOfStatus,
  renderErrorPage,
  withoutBase,
} from '../src/page-errors.js';

describe('the functions middleware, before anything else (§4.15)', () => {
  type Middleware = (req: { url?: string }, res: unknown, next: () => void) => void;

  /** Every middleware the plugin registers, in order. */
  async function middlewares(hook: 'configureServer' | 'configurePreviewServer'): Promise<Middleware[]> {
    const used: Middleware[] = [];
    const plugin = fudic({ routesDir: 'fixtures' }) as unknown as Record<string, (...a: unknown[]) => unknown>;
    plugin['config']!({});
    plugin['configResolved']!({ root: fileURLToPath(new URL('..', import.meta.url)), base: '/', command: 'serve', build: { outDir: 'dist' } });
    await plugin[hook]!({
      ...fakeDevServerParts(),
      middlewares: { use: (fn: Middleware) => used.push(fn) },
      transformRequest: async () => ({ code: '' }),
    });
    return used;
  }

  it.each(['configureServer', 'configurePreviewServer'] as const)('%s: a request without url is not a function’s', async (hook) => {
    const [first] = await middlewares(hook);
    const next = vi.fn();
    first!({}, {}, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('classifyError (§4.8)', () => {
  const httpError = (status: number, extra: Record<string, unknown> = {}, detail?: string) => ({
    status,
    problem: { status, title: 'T', ...(detail !== undefined ? { detail } : {}) },
    ...extra,
  });

  it('a Redirect: its status and its location', () => {
    expect(classifyError(httpError(303, { location: '/login' }), false)).toEqual({
      kind: 'redirect',
      status: 303,
      location: '/login',
    });
  });

  it('an HttpError: its problem, not unexpected', () => {
    expect(classifyError(httpError(404, {}, 'x'), false)).toEqual({
      kind: 'error',
      problem: { status: 404, title: 'T', detail: 'x' },
      unexpected: false,
    });
    expect(classifyError(httpError(409), true)).toEqual({ kind: 'error', problem: { status: 409, title: 'T' }, unexpected: false });
  });

  it('a location outside 3xx, or not a string, is no redirect', () => {
    expect(classifyError(httpError(404, { location: '/x' }), false).kind).toBe('error');
    expect(classifyError(httpError(303, { location: 1 }), false).kind).toBe('error');
  });

  it('anything else: a 500, with the message only in dev', () => {
    expect(classifyError(new Error('secreto'), false)).toEqual({
      kind: 'error',
      problem: { status: 500, title: 'Internal Server Error' },
      unexpected: true,
    });
    expect(classifyError(new Error('secreto'), true)).toMatchObject({ problem: { detail: 'secreto' }, unexpected: true });
    expect(classifyError('plain', true)).toMatchObject({ problem: { detail: 'plain' } });
    expect(classifyError(null, true)).toMatchObject({ problem: { status: 500 } });
    expect(classifyError({ status: 'x', problem: {} }, false)).toMatchObject({ unexpected: true });
    expect(classifyError({ status: 404 }, false)).toMatchObject({ unexpected: true });
  });
});

describe('the error page', () => {
  it('names its file and its one URL', () => {
    expect(ERROR_FILE).toBe('_error.fud');
    expect(ERROR_PATTERN).toBe('/_fudic/error/:status');
  });

  it('problemOfStatus: the standard title, or Error', () => {
    expect(problemOfStatus(404)).toEqual({ status: 404, title: 'Not Found' });
    expect(problemOfStatus(599)).toEqual({ status: 599, title: 'Error' });
  });

  it('withoutBase: the path inside the app, or null outside it', () => {
    expect(withoutBase('/usuarios', '/')).toBe('/usuarios');
    expect(withoutBase('/admin/usuarios', '/admin/')).toBe('/usuarios');
    expect(withoutBase('/admin', '/admin/')).toBe('/');
    expect(withoutBase('/administrar', '/admin/')).toBeNull();
  });

  describe('backOf: the way back is the Referer of this origin, resolved (SDD-73 §3.6, criteria 12–13)', () => {
    const ORIGIN = 'https://app.com';

    it('a page of this app: its path and its query, without the base', () => {
      expect(backOf('https://app.com/usuarios?p=2', ORIGIN, '/')).toBe('/usuarios?p=2');
      expect(backOf('https://app.com/admin/usuarios', ORIGIN, '/admin/')).toBe('/usuarios');
    });

    it('none without a Referer, from another origin, outside the base, or not a URL', () => {
      expect(backOf(null, ORIGIN, '/')).toBeUndefined();
      expect(backOf('https://evil.com/usuarios', ORIGIN, '/')).toBeUndefined();
      expect(backOf('http://app.com/usuarios', ORIGIN, '/')).toBeUndefined();
      expect(backOf('https://app.com/otra/x', ORIGIN, '/admin/')).toBeUndefined();
      expect(backOf('/usuarios', ORIGIN, '/')).toBeUndefined();
      expect(backOf('no es una url', ORIGIN, '/')).toBeUndefined();
    });

    it('none for a path a browser reads as another host: `/\\evil.com`', () => {
      expect(backOf('https://app.com/\\evil.com', ORIGIN, '/')).toBeUndefined();
      expect(backOf('https://app.com//evil.com', ORIGIN, '/')).toBeUndefined();
    });
  });

  describe('pageOriginOf: path and back of a request (SDD-73 §4.5)', () => {
    const request = (url: string, referer?: string): Request =>
      new Request(url, referer === undefined ? {} : { headers: { referer } });

    it('a navigation: the path asked for, and the Referer as the way back', () => {
      expect(pageOriginOf(request('https://app.com/usuarios/99', 'https://app.com/usuarios'), '/', false)).toEqual({
        path: '/usuarios/99',
        back: '/usuarios',
      });
      expect(pageOriginOf(request('https://app.com/admin/test'), '/admin/', false)).toEqual({ path: '/test' });
    });

    it('a call that failed: the page that made it is the path and the way back', () => {
      expect(pageOriginOf(request('https://app.com/_fudic/error/401', 'https://app.com/usuarios?p=2'), '/', true)).toEqual({
        path: '/usuarios',
        back: '/usuarios?p=2',
      });
      expect(pageOriginOf(request('https://app.com/_fudic/error/401'), '/', true)).toEqual({ path: '/_fudic/error/401' });
    });

    it('a path outside the base stays as it was asked', () => {
      expect(pageOriginOf(request('https://app.com/fuera'), '/admin/', false)).toEqual({ path: '/fuera' });
    });
  });

  it('the minimal page: the status and the title, escaped', () => {
    const html = minimalErrorPage({ status: 404, title: '<b>Not Found</b>' });
    expect(html).toContain('<h1>404</h1>');
    expect(html).toContain('&lt;b&gt;Not Found&lt;/b&gt;');
    expect(html).not.toContain('<b>');
  });

  it('renderErrorPage without _error.fud is the minimal page', async () => {
    expect(await renderErrorPage(null, { status: 410, title: 'Gone' }, 'n', { path: '/x' })).toBe(
      minimalErrorPage({ status: 410, title: 'Gone' }),
    );
  });

  it('renderErrorPage with _error.fud renders it with the problem as data, at its URL', async () => {
    let seen: Record<string, unknown> | undefined;
    const mod = {
      render: (ctx: Record<string, unknown>) => {
        seen = ctx;
        return new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode(`<h1>${(ctx['data'] as { status: number }).status}</h1>`));
            c.close();
          },
        });
      },
    };
    const origin = { path: '/usuarios/99', back: '/usuarios' };
    const html = await renderErrorPage(mod as never, { status: 404, title: 'Not Found', detail: 'x' }, 'nonce1', origin);
    expect(html).toBe('<h1>404</h1>');
    expect(seen!['data']).toEqual({ status: 404, title: 'Not Found', detail: 'x', path: '/usuarios/99', back: '/usuarios' });
    expect(seen!['nonce']).toBe('nonce1');
    expect(JSON.stringify(seen)).toContain('/_fudic/error/404');
  });
});
