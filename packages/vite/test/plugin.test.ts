/**
 * Unit coverage of the plugin hooks (SDD-19 §3.1, SDD-20 §4.7/§4.11) driven with fake
 * Rollup/Vite contexts, so the dev/build branches, the middleware paths and the
 * diagnostics wiring are exercised deterministically without a full `vite build`
 * (which the build-*.test.ts files cover).
 */

import { describe, it, expect, vi } from 'vitest';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fudic } from '../src/index.js';
import { WRAPPER_PREFIX, SW_ID, MAIN_ID } from '../src/constants.js';

// The compiler fixtures act as a routes dir: `home.fud` is the single page route.
const root = fileURLToPath(new URL('../../compiler', import.meta.url));
const homeFud = fileURLToPath(new URL('../../compiler/fixtures/home.fud', import.meta.url));

/** A project root that DOES have a `sw.json`, so the Service Worker is emitted. */
function swRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fudic-swroot-'));
  cpSync(join(root, 'fixtures'), join(dir, 'fixtures'), { recursive: true });
  writeFileSync(join(dir, 'sw.json'), JSON.stringify({ shell: ['/style.css'] }));
  return dir;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyHook = any;

function setup(
  command: 'build' | 'serve',
  userOptions: Record<string, unknown> = {},
  projectRoot = root,
): AnyHook {
  const plugin = fudic({ routesDir: 'fixtures', ...userOptions }) as AnyHook;
  plugin.config({});
  plugin.configResolved({ root: projectRoot, base: '/', command, build: { outDir: 'dist' } });
  return plugin;
}

const emitCtx = (): { emitFile: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> } => ({
  emitFile: vi.fn((o: { id?: string }) => `ref:${o.id ?? 'x'}`),
  warn: vi.fn(),
});

describe('config / configResolved', () => {
  it('config declares the custom shell entry', () => {
    const plugin = fudic() as AnyHook;
    expect(plugin.config({})).toMatchObject({ appType: 'custom' });
  });

  it('accepts a manifestUrl that does not sit under base (fallback file name)', () => {
    expect(() => setup('build', { manifestUrl: '/elsewhere.json' })).not.toThrow();
  });
});

describe('resolveId', () => {
  it('claims the virtual ids and ignores the rest', () => {
    const p = setup('build');
    expect(p.resolveId(MAIN_ID)).toBe(MAIN_ID);
    expect(p.resolveId(WRAPPER_PREFIX + '/home')).toBe(WRAPPER_PREFIX + '/home');
    expect(p.resolveId('./something.ts')).toBeNull();
  });
});

describe('load — with and without sw.json', () => {
  it('no sw.json: the main bootstrap is empty and no SW is emitted (§4.7)', () => {
    const p = setup('build');
    const ctx = emitCtx();
    p.buildStart.call(ctx);
    expect(p.load(MAIN_ID)).toBe('export {};\n');
    expect(ctx.emitFile).toHaveBeenCalledTimes(1); // the home wrapper only
  });

  it('with sw.json: main registers the SW and the SW bootstrap renders locally', () => {
    const p = setup('build', {}, swRoot());
    p.buildStart.call(emitCtx());
    expect(p.load(MAIN_ID)).toContain('ROLLUP_FILE_URL');
    expect(p.load(MAIN_ID)).toContain('registerRenderServiceWorker');
    expect(p.load(SW_ID)).toContain('createRouter');
    expect(p.load(SW_ID)).toContain('"/style.css"');
    expect(p.load(WRAPPER_PREFIX + '/home')).toContain('htmlToByteStream');
  });

  it('dev does not register the SW unless sw.json asks for it (§4.11)', () => {
    expect(setup('serve', {}, swRoot()).load(MAIN_ID)).toBe('export {};\n');
  });

  it('returns null for an unknown wrapper pattern and any other id', () => {
    const p = setup('build'); // no buildStart → builds empty
    expect(p.load(WRAPPER_PREFIX + '/nope')).toBeNull();
    expect(p.load('./x.ts')).toBeNull();
  });
});

describe('buildStart', () => {
  it('emits a wrapper per route plus the SW chunk', () => {
    const ctx = emitCtx();
    setup('build', {}, swRoot()).buildStart.call(ctx);
    expect(ctx.emitFile).toHaveBeenCalledTimes(2); // home wrapper + sw
  });

  it('skips an excluded route', () => {
    const ctx = emitCtx();
    setup('build', { defaults: { '/home': { mode: 'exclude' } } }, swRoot()).buildStart.call(ctx);
    expect(ctx.emitFile).toHaveBeenCalledTimes(1); // only sw
  });

  it('warns route diagnostics (FUD0364 default with no match)', () => {
    const ctx = emitCtx();
    setup('build', { defaults: { '/nope': { mode: 'exclude' } } }).buildStart.call(ctx);
    expect(ctx.warn).toHaveBeenCalledWith(expect.stringContaining('FUD0364'));
  });

  it('is a no-op in dev (no emitFile)', () => {
    const ctx = emitCtx();
    setup('serve').buildStart.call(ctx);
    expect(ctx.emitFile).not.toHaveBeenCalled();
  });
});

interface FakeRes {
  statusCode?: number;
  headers: Record<string, string>;
  body: string;
  setHeader(k: string, v: string): void;
  end(b?: string): void;
}
const fakeRes = (): FakeRes => ({
  headers: {},
  body: '',
  setHeader(k, v) {
    this.headers[k.toLowerCase()] = v;
  },
  end(b = '') {
    this.body = b;
  },
});
const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('configureServer middleware', () => {
  function withServer(
    transformRequest: (id: string) => Promise<{ code: string }>,
  ): (req: { url: string }, res: FakeRes, next: () => void) => void {
    let handler!: (req: { url: string }, res: FakeRes, next: () => void) => void;
    const server = { middlewares: { use: (fn: typeof handler) => (handler = fn) }, transformRequest };
    setup('serve').configureServer(server);
    return handler;
  }

  it('serves the manifest as JSON, every route rendered by the edge in dev', () => {
    const handler = withServer(async () => ({ code: '' }));
    const res = fakeRes();
    handler({ url: '/fudic-routes.json' }, res, () => undefined);
    expect(res.headers['content-type']).toContain('application/json');
    expect(JSON.parse(res.body).routes[0]).toMatchObject({ pattern: '/home', mode: 'ssr' });
  });

  it('serves the SW with a root-scope header and its own CSP', async () => {
    const handler = withServer(async () => ({ code: 'createRouter(...)' }));
    const res = fakeRes();
    handler({ url: '/fudic-sw.js' }, res, () => undefined);
    await flush();
    expect(res.headers['service-worker-allowed']).toBe('/');
    expect(res.headers['content-security-policy']).toContain('unsafe-eval');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.body).toContain('createRouter');
  });

  it('calls next() for an unrelated URL', () => {
    const handler = withServer(async () => ({ code: '' }));
    const next = vi.fn();
    handler({ url: '/whatever.css' }, fakeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('responds 500 when the transform fails', async () => {
    const handler = withServer(() => Promise.reject(new Error('boom')));
    const res = fakeRes();
    handler({ url: '/fudic-sw.js' }, res, () => undefined);
    await flush();
    expect(res.statusCode).toBe(500);
    expect(res.body).toContain('boom');
  });
});

describe('configurePreviewServer middleware', () => {
  // Preview is the production edge: the prerendered file when there is one, with the
  // CSP header and this response's nonce stamped into the document.
  function withPreview(
    outDir: string,
  ): (req: { url: string; method: string; headers: Record<string, string> }, res: FakeRes, next: () => void) => void {
    let handler!: (
      req: { url: string; method: string; headers: Record<string, string> },
      res: FakeRes,
      next: () => void,
    ) => void;
    const plugin = fudic({ routesDir: 'fixtures' }) as AnyHook;
    plugin.config({});
    plugin.configResolved({ root, base: '/', command: 'build', build: { outDir } });
    plugin.configurePreviewServer({ middlewares: { use: (fn: typeof handler) => (handler = fn) } });
    return handler;
  }

  const navigation = (
    url: string,
  ): { url: string; method: string; headers: Record<string, string> } => ({
    url,
    method: 'GET',
    headers: { accept: 'text/html,application/xhtml+xml' },
  });

  /** A built output dir: the manifest plus one prerendered page. */
  function outputWith(routes: unknown[]): string {
    const outDir = mkdtempSync(join(tmpdir(), 'fudic-preview-'));
    writeFileSync(
      join(outDir, 'fudic-routes.json'),
      JSON.stringify({
        build: 'b1',
        csp: { document: "script-src 'nonce-{nonce}'", sw: "script-src 'unsafe-eval'" },
        routes,
      }),
    );
    return outDir;
  }

  it('serves the prerendered file with a CSP and the nonce substituted', () => {
    const outDir = outputWith([{ pattern: '/about', mode: 'ssg', html: '/about/index.html' }]);
    mkdirSync(join(outDir, 'about'), { recursive: true });
    writeFileSync(join(outDir, 'about', 'index.html'), '<script nonce="__FUDIC_NONCE__"></script>');
    const handler = withPreview(outDir);
    const res = fakeRes();
    handler(navigation('/about'), res, () => expect.unreachable('should not fall through'));
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('__FUDIC_NONCE__');
    const nonce = /nonce="([^"]+)"/u.exec(res.body)?.[1] ?? '';
    expect(res.headers['content-security-policy']).toContain(`'nonce-${nonce}'`);
  });

  it('falls through for an unknown route, a non-GET, and a route with no output', () => {
    const outDir = outputWith([{ pattern: '/blog', mode: 'sw' }]);
    const handler = withPreview(outDir);
    const next = vi.fn();
    handler(navigation('/blog'), fakeRes(), next); // no html, no esm
    handler(navigation('/nope'), fakeRes(), next);
    handler({ url: '/', method: 'POST', headers: { accept: 'text/html' } }, fakeRes(), next);
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('falls through when there is no manifest at all', () => {
    const handler = withPreview(mkdtempSync(join(tmpdir(), 'fudic-empty-')));
    const next = vi.fn();
    handler(navigation('/about'), fakeRes(), next);
    expect(next).toHaveBeenCalled();
  });
});

describe('transform', () => {
  it('ignores non-.fud ids', async () => {
    expect(await setup('build').transform.call(emitCtx(), '', '/x.ts')).toBeNull();
  });

  it('serves the ?server module type-stripped to JS', async () => {
    const result = await setup('build').transform.call(emitCtx(), '', `${homeFud}?server`);
    expect(result.code).toContain('function load'); // the @server load, types stripped
    expect(result.code).not.toContain(': Promise<'); // TS annotation gone
  });
});
