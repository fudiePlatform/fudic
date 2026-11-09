/** What a navigation answers when `load` or `layout` throws (SDD-56 §4.8), as `@fudic/server` has it. */

import { describe, expect, it } from 'vitest';
import {
  backOf,
  classifyError,
  ERROR_PATTERN,
  minimalErrorPage,
  pageOriginOf,
  problemOfStatus,
  renderErrorPage,
  withoutBase,
} from '../src/index.js';
import { httpError, redirect, streamOf } from './helpers.js';

describe('classifyError', () => {
  it('a Redirect: its status and location', () => {
    expect(classifyError(redirect('/login'), false)).toEqual({ kind: 'redirect', status: 303, location: '/login' });
  });

  it('an HttpError with a location outside 3xx is an error still, and one without detail has none', () => {
    expect(classifyError({ ...httpError(404, 'Not Found', 'x'), location: '/y' }, false)).toEqual({
      kind: 'error',
      problem: { status: 404, title: 'Not Found', detail: 'x' },
      unexpected: false,
    });
    expect(classifyError({ ...httpError(409), location: 3 }, true)).toEqual({ kind: 'error', problem: { status: 409, title: 'T' }, unexpected: false });
  });

  it('anything else: an unexpected 500, its message only in dev', () => {
    expect(classifyError(new Error('boom'), true)).toEqual({
      kind: 'error',
      problem: { status: 500, title: 'Internal Server Error', detail: 'boom' },
      unexpected: true,
    });
    expect(classifyError('text', true).kind === 'error' && classifyError('text', true)).toMatchObject({ problem: { detail: 'text' } });
    expect(classifyError(new Error('boom'), false)).toEqual({ kind: 'error', problem: { status: 500, title: 'Internal Server Error' }, unexpected: true });
  });

  it('a value that is not an HttpError by shape: null, a status without problem', () => {
    expect(classifyError(null, false)).toMatchObject({ unexpected: true });
    expect(classifyError({ status: 404 }, false)).toMatchObject({ unexpected: true });
    expect(classifyError({ status: '404', problem: {} }, false)).toMatchObject({ unexpected: true });
  });
});

describe('problemOfStatus', () => {
  it('the reason phrase of its status, or Error', () => {
    expect(problemOfStatus(418)).toEqual({ status: 418, title: "I'm a Teapot" });
    expect(problemOfStatus(499)).toEqual({ status: 499, title: 'Error' });
  });
});

describe('withoutBase / backOf / pageOriginOf', () => {
  it('withoutBase: the path under base, / for base itself, null outside', () => {
    expect(withoutBase('/app/x', '/app/')).toBe('/x');
    expect(withoutBase('/app', '/app/')).toBe('/');
    expect(withoutBase('/apple', '/app/')).toBeNull();
    expect(withoutBase('/x', '/')).toBe('/x');
  });

  it('backOf: a Referer of this origin and base, never another host’s', () => {
    const origin = 'http://app.test';
    expect(backOf('http://app.test/app/a?b=1', origin, '/app/')).toBe('/a?b=1');
    expect(backOf(null, origin, '/')).toBeUndefined();
    expect(backOf('not a url', origin, '/')).toBeUndefined();
    expect(backOf('http://evil.test/a', origin, '/')).toBeUndefined();
    expect(backOf('http://app.test/other', origin, '/app/')).toBeUndefined();
    expect(backOf('http://app.test//evil.test/x', origin, '/')).toBeUndefined();
  });

  it('pageOriginOf: the path asked, or for a call the page that made it', () => {
    const asked = new Request('http://app.test/app/usuarios/9', { headers: { referer: 'http://app.test/app/usuarios?p=2' } });
    expect(pageOriginOf(asked, '/app/', false)).toEqual({ path: '/usuarios/9', back: '/usuarios?p=2' });
    expect(pageOriginOf(asked, '/app/', true)).toEqual({ path: '/usuarios', back: '/usuarios?p=2' });
    expect(pageOriginOf(new Request('http://app.test/elsewhere'), '/app/', true)).toEqual({ path: '/elsewhere' });
  });
});

describe('minimalErrorPage / renderErrorPage', () => {
  it('the minimal page escapes what it writes', () => {
    const html = minimalErrorPage({ status: 500, title: '<b>&</b>' });
    expect(html).toContain('<title>500 &lt;b&gt;&amp;&lt;/b&gt;</title>');
    expect(html).toContain('<h1>500</h1>');
  });

  it('without _error.fud, the minimal page; with it, its render with the problem and the origin', async () => {
    expect(await renderErrorPage(null, { status: 404, title: 'Not Found' }, 'n', { path: '/x' })).toContain('<h1>404</h1>');
    const mod = {
      render: (ctx: { url: URL; nonce: string; data?: unknown }) => streamOf(`${ctx.url.pathname} ${ctx.nonce} ${JSON.stringify(ctx.data)}`),
    };
    expect(await renderErrorPage(mod as never, { status: 404, title: 'Not Found' }, 'n1', { path: '/x', back: '/y' })).toBe(
      '/_fudic/error/404 n1 {"status":404,"title":"Not Found","path":"/x","back":"/y"}',
    );
    expect(ERROR_PATTERN).toBe('/_fudic/error/:status');
  });
});
