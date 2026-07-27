/**
 * Unit coverage of the plugin hooks (SDD-19 §3.1) driven with fake Rollup/Vite contexts,
 * so the dev/build branches, the middleware paths and the diagnostics wiring are exercised
 * deterministically without a full `vite build` (which the build-*.test.ts files cover).
 */

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fudic } from '../src/index.js';
import { WRAPPER_PREFIX, WW_ID, SW_ID, MAIN_ID } from '../src/constants.js';

// The compiler fixtures act as a routes dir: `home.fud` is the single page route.
const root = fileURLToPath(new URL('../../compiler', import.meta.url));
const homeFud = fileURLToPath(new URL('../../compiler/fixtures/home.fud', import.meta.url));

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyHook = any;

function setup(command: 'build' | 'serve', userOptions: Record<string, unknown> = {}): AnyHook {
  const plugin = fudic({ routesDir: 'fixtures', ...userOptions }) as AnyHook;
  plugin.config({});
  plugin.configResolved({ root, base: '/', command, build: { outDir: 'dist' } });
  return plugin;
}

const emitCtx = (): { emitFile: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> } => ({
  emitFile: vi.fn((o: { id?: string }) => `ref:${o.id ?? 'x'}`),
  warn: vi.fn(),
});

describe('config / configResolved', () => {
  it('config declares the custom three-thread shell entry', () => {
    const plugin = fudic() as AnyHook;
    expect(plugin.config({})).toMatchObject({ appType: 'custom' });
  });

  it('accepts a manifestUrl that does not sit under base (fallback file name)', () => {
    // Exercises the else branch of manifestFileName without throwing.
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

describe('load — build vs dev URLs', () => {
  it('build mode references ROLLUP_FILE_URL for the SW/WW', () => {
    const p = setup('build');
    p.buildStart.call(emitCtx());
    expect(p.load(MAIN_ID)).toContain('ROLLUP_FILE_URL'); // both the SW and the WW urls
    expect(p.load(SW_ID)).toContain('createRouter');
    expect(p.load(WW_ID)).toContain('installRenderWorker');
    expect(p.load(WRAPPER_PREFIX + '/home')).toContain('htmlToByteStream'); // known wrapper
  });

  it('dev mode references the stable root URLs', () => {
    const p = setup('serve');
    expect(p.load(MAIN_ID)).toContain('fudic-sw.js');
    expect(p.load(MAIN_ID)).toContain('fudic-ww.js'); // the main thread creates the WW
  });

  it('returns null for an unknown wrapper pattern and any other id', () => {
    const p = setup('build'); // no buildStart → builds empty
    expect(p.load(WRAPPER_PREFIX + '/nope')).toBeNull();
    expect(p.load('./x.ts')).toBeNull();
  });
});

describe('buildStart', () => {
  it('emits a wrapper per route plus the WW and SW chunks', () => {
    const ctx = emitCtx();
    setup('build').buildStart.call(ctx);
    expect(ctx.emitFile).toHaveBeenCalledTimes(3); // home wrapper + ww + sw
  });

  it('skips an excluded route', () => {
    const ctx = emitCtx();
    setup('build', { routes: { '/home': { mode: 'exclude' } } }).buildStart.call(ctx);
    expect(ctx.emitFile).toHaveBeenCalledTimes(2); // only ww + sw
  });

  it('warns route diagnostics (FUD0364 override with no match)', () => {
    const ctx = emitCtx();
    setup('build', { routes: { '/nope': { mode: 'exclude' } } }).buildStart.call(ctx);
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
  function withServer(transformRequest: (id: string) => Promise<{ code: string }>): (req: { url: string }, res: FakeRes, next: () => void) => void {
    let handler!: (req: { url: string }, res: FakeRes, next: () => void) => void;
    const server = { middlewares: { use: (fn: typeof handler) => (handler = fn) }, transformRequest };
    setup('serve').configureServer(server);
    return handler;
  }

  it('serves the manifest as JSON', () => {
    const handler = withServer(async () => ({ code: '' }));
    const res = fakeRes();
    handler({ url: '/fudic-routes.json' }, res, () => undefined);
    expect(res.headers['content-type']).toContain('application/json');
    expect(JSON.parse(res.body)[0]).toMatchObject({ pattern: '/home', dynamic: true });
  });

  it('serves the SW with a root-scope header', async () => {
    const handler = withServer(async () => ({ code: 'createRouter(...)' }));
    const res = fakeRes();
    handler({ url: '/fudic-sw.js' }, res, () => undefined);
    await flush();
    expect(res.headers['service-worker-allowed']).toBe('/');
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
    handler({ url: '/fudic-ww.js' }, res, () => undefined);
    await flush();
    expect(res.statusCode).toBe(500);
    expect(res.body).toContain('boom');
  });
});

describe('configurePreviewServer middleware', () => {
  // `appType:'custom'` removes Vite's html fallback, so preview must map a route to its
  // prerendered file itself — and 404 when there is none (an incremental route).
  function withPreview(outDir: string): (req: { url: string; method: string; headers: Record<string, string> }, res: FakeRes, next: () => void) => void {
    let handler!: (req: { url: string; method: string; headers: Record<string, string> }, res: FakeRes, next: () => void) => void;
    const plugin = fudic({ routesDir: 'fixtures' }) as AnyHook;
    plugin.config({});
    plugin.configResolved({ root, base: '/', command: 'build', build: { outDir } });
    plugin.configurePreviewServer({ middlewares: { use: (fn: typeof handler) => (handler = fn) } });
    return handler;
  }

  const navigation = (url: string): { url: string; method: string; headers: Record<string, string> } => ({
    url,
    method: 'GET',
    headers: { accept: 'text/html,application/xhtml+xml' },
  });

  it('serves the prerendered file of a route', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'fudic-preview-'));
    mkdirSync(join(outDir, 'about'), { recursive: true });
    writeFileSync(join(outDir, 'about', 'index.html'), '<!DOCTYPE html><p>about</p>');
    const handler = withPreview(outDir);
    const res = fakeRes();
    handler(navigation('/about'), res, () => expect.unreachable('should not fall through'));
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<p>about</p>');
  });

  it('falls through when the route has no prerendered file, and for non-navigations', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'fudic-preview-'));
    const handler = withPreview(outDir);
    const next = vi.fn();
    handler(navigation('/blog'), fakeRes(), next); // incremental: the SW's job
    handler({ url: '/x.css', method: 'GET', headers: { accept: 'text/css' } }, fakeRes(), next);
    handler({ url: '/', method: 'POST', headers: { accept: 'text/html' } }, fakeRes(), next);
    expect(next).toHaveBeenCalledTimes(3);
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
