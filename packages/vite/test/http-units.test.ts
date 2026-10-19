/**
 * SDD-56 in the plugin, the pieces on their own: erasing the server halves from the client
 * bundle (§4.5, criteria 7 and 8), and what a navigation answers when `load` throws (§4.8).
 */

import { describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { fudic } from '../src/index.js';
import { fakeDevServerParts } from './helpers/dev-server.js';
import { ERROR_FILE } from '@fudic/conventions';
import { eraseServerHalves } from '../src/server-halves.js';
import {
  classifyError,
  ERROR_PATTERN,
  MAX_DETAIL,
  minimalErrorPage,
  problemOfStatus,
  problemOfUrl,
  renderErrorPage,
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

describe('eraseServerHalves (§4.5)', () => {
  it('replaces the argument of .server(…) in a module that imports @fudic/http', () => {
    const code = [
      "import { middleware } from '@fudic/http';",
      "import { createHash } from 'node:crypto';",
      'export const auth = middleware()',
      '  .client((ctx, next) => next(ctx))',
      "  .server((ctx, next) => { createHash('sha256'); return next(ctx); });",
    ].join('\n');
    const out = eraseServerHalves(code)!.code;
    // Blanked, not cut (BUG-47 §4.2): what is left of the argument is spaces.
    expect(out).toMatch(/\.server\(undefined +\);$/u);
    expect(out.split('\n').map((l) => l.length)).toEqual(code.split('\n').map((l) => l.length));
    expect(out).toContain('.client((ctx, next) => next(ctx))');
    expect(out).not.toContain("createHash('sha256')");
    // Only the erased half used it, so it goes with it (BUG-47 §4.1).
    expect(out).not.toContain('node:crypto');
  });

  it('reports the erased spans, in source coordinates', () => {
    const code = "import { middleware } from '@fudic/http';\nexport const a = middleware().server(SECRET);";
    const { erased } = eraseServerHalves(code)!;
    expect(erased.map((s) => code.slice(s.start, s.end))).toEqual(['SECRET']);
  });

  it('any receiver: a base kept in a const, a namespace import', () => {
    const code = [
      "import * as http from '@fudic/http';",
      'const base = http.middleware();',
      'export const a = base.server(SECRET_A);',
      'export const b = http.middleware().server(SECRET_B).client(c);',
    ].join('\n');
    const out = eraseServerHalves(code)!.code;
    expect(out).not.toContain('SECRET_A');
    expect(out).not.toContain('SECRET_B');
    expect(out).toContain('.client(c)');
  });

  it('a .server nested inside an erased argument goes with it', () => {
    const code = [
      "import { middleware } from '@fudic/http';",
      'export const a = middleware().server((ctx, next) => inner.server(DEEP) && next(ctx));',
    ].join('\n');
    const argument = '(ctx, next) => inner.server(DEEP) && next(ctx)';
    expect(eraseServerHalves(code)?.code).toBe(code.replace(argument, `undefined${' '.repeat(argument.length - 9)}`));
  });

  it('a longer replacement than the argument keeps the lines: only that line’s columns move', () => {
    const code = "import { middleware } from '@fudic/http';\nexport const a = middleware().server(\nA\n);\nnext;";
    expect(eraseServerHalves(code)?.code).toBe(
      "import { middleware } from '@fudic/http';\nexport const a = middleware().server(\nundefined\n);\nnext;",
    );
  });

  it('BUG-47 §4.6: a module of @fudic/http itself is erased without the import mark', () => {
    // `csrf` imports `middleware` by a relative path, so it never carries `@fudic/http`.
    const code = "import { middleware } from './middleware.js';\nexport const csrf = middleware().client(c).server(CHECK);";
    expect(eraseServerHalves(code)).toBeNull();
    expect(eraseServerHalves(code, true)?.code).toContain('.server(undefined)');
    expect(eraseServerHalves(code, true)?.code).not.toContain('CHECK');
    // Inside the package, still nothing to do without a `.server`.
    expect(eraseServerHalves('export const a = 1;', true)).toBeNull();
  });

  it('several in one module, each erased', () => {
    const code = "import { middleware } from '@fudic/http';\nexport const a = middleware().server(A);\nexport const b = middleware().server(B);";
    expect(eraseServerHalves(code)?.code).toBe(
      "import { middleware } from '@fudic/http';\nexport const a = middleware().server(undefined);\nexport const b = middleware().server(undefined);",
    );
  });

  it('nothing to do: no .server, no @fudic/http, no import of it, no single-argument call', () => {
    expect(eraseServerHalves("import { middleware } from '@fudic/http';\nexport const a = middleware();")).toBeNull();
    expect(eraseServerHalves('const app = express();\napp.server(x);')).toBeNull();
    // The text names the package but nothing imports it.
    expect(eraseServerHalves("const s = '@fudic/http';\napp.server(x);")).toBeNull();
    expect(eraseServerHalves("import { middleware } from '@fudic/http';\nobj.server();\nobj.server(a, b);")).toBeNull();
    expect(eraseServerHalves("import { middleware } from '@fudic/http';\nobj['server'](a);\nserver(a);")).toBeNull();
  });

  it('a type-only import of @fudic/http still marks the module', () => {
    const out = eraseServerHalves("import type { Middleware } from '@fudic/http';\nexport const a: Middleware = m.server(S);");
    expect(out?.code).toContain('m.server(undefined)');
  });

  it('a .server of something else in the same module is the price of erring on the safe side', () => {
    const out = eraseServerHalves("import { middleware } from '@fudic/http';\nconst x = app.server(port);");
    expect(out?.code).toContain('app.server(undefined)');
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

  it('problemOfUrl: the status gives the title, the query its detail (BUG-51)', () => {
    expect(problemOfUrl(401, '/_fudic/error/401?detail=sin%20token')).toEqual({
      status: 401,
      title: 'Unauthorized',
      detail: 'sin token',
    });
    expect(problemOfUrl(404, 'http://app.test/_fudic/error/404?x=1&detail=no+such+user')).toEqual({
      status: 404,
      title: 'Not Found',
      detail: 'no such user',
    });
  });

  it('problemOfUrl: an absent or empty detail is no detail', () => {
    expect(problemOfUrl(403, '/_fudic/error/403')).toEqual({ status: 403, title: 'Forbidden' });
    expect(problemOfUrl(403, '/_fudic/error/403?detail=')).toEqual({ status: 403, title: 'Forbidden' });
  });

  it(`problemOfUrl: a detail is cut at MAX_DETAIL (${MAX_DETAIL}), never refused`, () => {
    const long = 'x'.repeat(MAX_DETAIL + 50);
    expect(MAX_DETAIL).toBe(300);
    expect(problemOfUrl(500, `/_fudic/error/500?detail=${long}`).detail).toBe('x'.repeat(MAX_DETAIL));
  });

  it('the minimal page: the status and the title, escaped', () => {
    const html = minimalErrorPage({ status: 404, title: '<b>Not Found</b>' });
    expect(html).toContain('<h1>404</h1>');
    expect(html).toContain('&lt;b&gt;Not Found&lt;/b&gt;');
    expect(html).not.toContain('<b>');
  });

  it('renderErrorPage without _error.fud is the minimal page', async () => {
    expect(await renderErrorPage(null, { status: 410, title: 'Gone' }, 'n')).toBe(minimalErrorPage({ status: 410, title: 'Gone' }));
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
    const html = await renderErrorPage(mod as never, { status: 404, title: 'Not Found', detail: 'x' }, 'nonce1');
    expect(html).toBe('<h1>404</h1>');
    expect(seen!['data']).toEqual({ status: 404, title: 'Not Found', detail: 'x' });
    expect(seen!['nonce']).toBe('nonce1');
    expect(JSON.stringify(seen)).toContain('/_fudic/error/404');
  });
});
