/**
 * SDD-82 §3.8 and §4.7: the app's server without a real Vite — the bench installed before the
 * app's Vite starts and taken away if it cannot, `/__bench/criterion/<id>` before Vite, a 404
 * when Vite passes, the build for the criteria without network made once and again after a
 * change of the app, the real `paths()` of a route — and the requests in flight of a context, as
 * the quiet page counts them.
 */

import { describe, expect, it } from 'vitest';
import { installedBench } from '@fudic/vite';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import { startApp, type Preview, type PreviewStarter } from '../src/app.js';
import { inFlight, pageRecord } from '../src/browser.js';

type FakeVite = ViteDevServer & { change(path: string): void };

/** A Vite that answers `/a`, passes everything else, and tells who watches when a file changes. */
function fakeVite(closed: string[], modules: Readonly<Record<string, unknown>> = {}): FakeVite {
  const watchers: ((event: string, path: string) => void)[] = [];
  return {
    middlewares: (req: { url: string }, res: { writeHead(s: number): { end(t: string): void } }, next: () => void) => {
      if (req.url === '/a') res.writeHead(200).end('page a');
      else next();
    },
    watcher: { on: (_: string, listener: (event: string, path: string) => void) => void watchers.push(listener) },
    ssrLoadModule: async (id: string) => modules[id] ?? {},
    change: (path: string) => {
      for (const watcher of watchers) watcher('change', path);
    },
    close: async () => void closed.push('vite'),
  } as unknown as FakeVite;
}

/** A preview starter that counts its builds and keeps the bench's endpoint plugin. */
function fakePreview(closed: string[]): { start: PreviewStarter; builds: string[]; plugin: () => Plugin } {
  const builds: string[] = [];
  let plugin: Plugin | undefined;
  const start: PreviewStarter = async (root, outDir, extra): Promise<Preview> => {
    builds.push(`${root} -> ${outDir}`);
    plugin = extra;
    const n = builds.length;
    return { origin: `http://127.0.0.1:${4000 + n}`, close: async () => void closed.push(`preview ${n}`) };
  };
  return { start, builds, plugin: () => plugin! };
}

describe('startApp', () => {
  it('installs the bench, serves the criteria and Vite on its own port, and undoes it all on close', async () => {
    const closed: string[] = [];
    const app = await startApp('C:/p', 'C:/p/out', {
      vite: async () => {
        expect(installedBench()).toBeDefined();
        return fakeVite(closed);
      },
    });
    expect(app.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
    expect(app.run).toMatch(/^[a-z0-9]+$/u);
    app.bench.begin('r-1.c', {}, { services: 's' });
    expect(await (await fetch(`${app.origin}/__bench/criterion/r-1.c`)).json()).toEqual({ services: 's', answers: [], clock: null });
    expect(await (await fetch(`${app.origin}/a`)).text()).toBe('page a');
    const missing = await fetch(`${app.origin}/b?x=1`);
    expect([missing.status, await missing.text()]).toEqual([404, 'not found']);
    await app.close();
    expect(closed).toEqual(['vite']);
    expect(installedBench()).toBeUndefined();
  });

  it('a Vite that does not start takes the bench away with it', async () => {
    await expect(startApp('C:/p', 'C:/p/out', { vite: () => Promise.reject(new Error('no config')) })).rejects.toThrow('no config');
    expect(installedBench()).toBeUndefined();
  });

  it('builds the app once for the offline criteria, and again after a change of the app only', async () => {
    const closed: string[] = [];
    const vite = fakeVite(closed);
    const preview = fakePreview(closed);
    const app = await startApp('C:/p', 'C:/p/out', { vite: async () => vite, preview: preview.start });
    expect((await app.offline()).origin).toBe('http://127.0.0.1:4001');
    expect((await app.offline()).origin).toBe('http://127.0.0.1:4001');
    // What the bench or a build writes is no change of the app.
    vite.change('C:/p/node_modules/.fudic-bench/1/app/dist/index.html');
    vite.change('C:/p/.fudic/api/routes/a.d.ts');
    expect((await app.offline()).origin).toBe('http://127.0.0.1:4001');
    vite.change('C:/p/src/routes/a.fud');
    expect((await app.offline()).origin).toBe('http://127.0.0.1:4002');
    expect(closed).toEqual(['preview 1']);
    expect(preview.builds).toEqual(['C:/p -> C:/p/out', 'C:/p -> C:/p/out']);
    await app.close();
    expect(closed).toEqual(['preview 1', 'preview 2', 'vite']);
  });

  it('serves the criterion endpoint on the preview too, and passes everything else', async () => {
    const closed: string[] = [];
    const preview = fakePreview(closed);
    const app = await startApp('C:/p', 'C:/p/out', { vite: async () => fakeVite(closed), preview: preview.start });
    await app.offline();
    let middleware: (req: unknown, res: unknown, next: () => void) => void = () => undefined;
    const server = { middlewares: { use: (fn: typeof middleware) => void (middleware = fn) } } as unknown as PreviewServer;
    (preview.plugin().configurePreviewServer as (server: PreviewServer) => void)(server);
    app.bench.begin('r-1.c', {}, {});
    const written: string[] = [];
    const res = { writeHead: () => ({ end: (body: string) => void written.push(body) }) };
    middleware({ url: '/__bench/criterion/r-1.c?x' }, res, () => written.push('next'));
    middleware({ url: '/other' }, res, () => written.push('next'));
    expect(written).toEqual([JSON.stringify({ services: null, answers: [], clock: null }), 'next']);
    await app.close();
  });

  it('a build that fails rejects until the app changes, and close survives it', async () => {
    const closed: string[] = [];
    const vite = fakeVite(closed);
    let fail = true;
    const preview: PreviewStarter = async () => {
      if (fail) throw new Error('the build broke');
      return { origin: 'http://127.0.0.1:4100', close: async () => void closed.push('preview') };
    };
    const app = await startApp('C:/p', 'C:/p/out', { vite: async () => vite, preview });
    await expect(app.offline()).rejects.toThrow('the build broke');
    fail = false;
    await expect(app.offline()).rejects.toThrow('the build broke');
    vite.change('C:/p/src/routes/a.fud');
    expect((await app.offline()).origin).toBe('http://127.0.0.1:4100');
    await app.close();
    expect(closed).toEqual(['preview', 'vite']);
  });

  it('runs the real paths() of a route, and says when it has none', async () => {
    const closed: string[] = [];
    const modules = { 'fudic-wrapper:/blog/:slug': { paths: async () => ['a', { slug: 'b' }] } };
    const app = await startApp('C:/p', 'C:/p/out', { vite: async () => fakeVite(closed, modules) });
    expect(await app.paths('/blog/:slug')).toEqual(['a', { slug: 'b' }]);
    expect(await app.paths('/about')).toBeNull();
    await app.close();
  });
});

describe('inFlight', () => {
  it('counts the requests of a context until they finish or fail, never a stream', () => {
    const listeners = new Map<string, (request: unknown) => void>();
    const pending = inFlight({ on: ((event: string, listener: (request: unknown) => void) => void listeners.set(event, listener)) as never });
    const request = (type: string, path: string) => ({ resourceType: () => type, method: () => 'GET', url: () => `http://x${path}?q=1` });
    const a = request('fetch', '/a');
    const b = request('document', '/b');
    listeners.get('request')!(a);
    listeners.get('request')!(b);
    listeners.get('request')!(request('eventsource', '/events'));
    listeners.get('request')!(request('websocket', '/ws'));
    expect(pending()).toEqual(['GET /a', 'GET /b']);
    listeners.get('requestfinished')!(a);
    listeners.get('requestfailed')!(b);
    expect(pending()).toEqual([]);
  });
});

describe('pageRecord', () => {
  it('keeps the last response of a main-frame navigation, none after one that failed, the requests sent and the downloads', () => {
    const listeners = new Map<string, (value: unknown) => void>();
    const contextListeners = new Map<string, (value: unknown) => void>();
    const main = { name: 'main' };
    const page = {
      on: (event: string, listener: (value: unknown) => void) => void listeners.set(event, listener),
      mainFrame: () => main,
      context: () => ({ on: (event: string, listener: (value: unknown) => void) => void contextListeners.set(event, listener) }),
    };
    const record = pageRecord(page as never);
    const request = (navigation: boolean, frame: unknown) => ({ isNavigationRequest: () => navigation, frame: () => frame });
    const response = (req: unknown, status: number) => ({ request: () => req, status: () => status, headers: () => ({ 'x-a': String(status) }) });
    expect(record.document()).toBeNull();
    listeners.get('response')!(response(request(true, main), 200));
    // Neither a resource nor a frame's navigation is the document.
    listeners.get('response')!(response(request(false, main), 500));
    listeners.get('response')!(response(request(true, { name: 'iframe' }), 404));
    expect(record.document()).toEqual({ status: 200, headers: { 'x-a': '200' } });
    listeners.get('requestfailed')!(request(false, main));
    expect(record.document()).toEqual({ status: 200, headers: { 'x-a': '200' } });
    listeners.get('requestfailed')!(request(true, main));
    expect(record.document()).toBeNull();
    listeners.get('download')!({ suggestedFilename: () => 'personas.csv' });
    expect(record.downloads()).toEqual(['personas.csv']);
    contextListeners.get('request')!({});
    contextListeners.get('request')!({});
    expect(record.requests()).toBe(2);
  });
});
