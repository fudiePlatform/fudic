/**
 * Unit coverage of the plugin hooks (SDD-19 §3.1, SDD-20 §4.7/§4.11) driven with fake
 * Rollup/Vite contexts, so the dev/build branches, the middleware paths and the
 * diagnostics wiring are exercised deterministically without a full `vite build`
 * (which the build-*.test.ts files cover).
 *
 * The project typecheck (SDD-35) is replaced by a scripted one: the routes dir here is the
 * compiler's own fixtures folder, and checking the whole compiler package on every
 * `buildStart` would test the compiler's fixtures, not these hooks. What the typecheck does
 * to a build and to the dev server is what this file asks of it, with the report it answers
 * set by each test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FUD0870, span } from '@fudic/diagnostics';
import { toPosix, type CheckReport } from '@fudic/typecheck';
import { fudic } from '../src/index.js';
import { WRAPPER_PREFIX, SW_ID, MAIN_ID, BOOT_ID } from '../src/constants.js';
import { emitServerModule, type ServerModuleInput } from '../src/server-module.js';
import { fakeDevServerParts } from './helpers/dev-server.js';

/** What the scripted typecheck answers; clean unless a test says otherwise. */
const checked = vi.hoisted(() => ({
  report: { problems: [], project: [], inputs: [] } as CheckReport,
}));

vi.mock('@fudic/typecheck', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fudic/typecheck')>();
  return {
    ...original,
    createProjectChecker: () => ({ check: () => checked.report, invalidate: () => undefined }),
  };
});

// The build runs the same check on a worker thread, which loads the real package: scripted alike.
/** How many checks the build started, and how many it cancelled. */
const checks = vi.hoisted(() => ({ started: 0, cancelled: 0, dies: false }));

vi.mock('../src/background-check.js', () => ({
  startBackgroundCheck: () => {
    checks.started += 1;
    return {
      report: checks.dies ? Promise.reject(new Error('the check thread died')) : Promise.resolve(checked.report),
      cancel: async () => {
        checks.cancelled += 1;
      },
    };
  },
}));

// Dev checks in a child process that loads the real package: scripted alike, with the real
// `resilientChecker` in front of it, so a child that dies falls back to the checker above.
/** The scripted child: whether it dies, and how many times it was disposed. */
const child = vi.hoisted(() => ({ dies: false, disposed: 0, roots: [] as string[] }));

vi.mock('../src/live-checker.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/live-checker.js')>();
  return {
    ...original,
    startLiveChecker: (root: string) => {
      child.roots.push(root);
      return {
        check: () => (child.dies ? Promise.reject(new Error('the typecheck process ended')) : Promise.resolve(checked.report)),
        invalidate: () => undefined,
        dispose: () => {
          child.disposed += 1;
        },
      };
    },
  };
});

beforeEach(() => {
  checked.report = { problems: [], project: [], inputs: [] };
  child.dies = false;
  child.disposed = 0;
  child.roots = [];
});

// The compiler fixtures act as a routes dir: `home.fud` is the single page route.
const root = fileURLToPath(new URL('../../compiler', import.meta.url));
const homeFud = fileURLToPath(new URL('../../compiler/fixtures/home.fud', import.meta.url));

/** A project root that DOES have a `sw.json`, so the Service Worker is emitted. */
function swRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fudic-swroot-'));
  cpSync(join(root, 'fixtures'), join(dir, 'fixtures'), { recursive: true });
  writeFileSync(join(dir, 'sw.json'), JSON.stringify({ shell: ['/style.css'] }));
  writeFileSync(join(dir, 'fudic.json'), JSON.stringify({ id: 'test' }));
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
  plugin.config({}, { command: 'serve', mode: 'development' });
  plugin.configResolved({ root: projectRoot, base: '/', command, build: { outDir: 'dist' } });
  return plugin;
}

const emitCtx = (): { emitFile: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> } => ({
  emitFile: vi.fn((o: { id?: string }) => `ref:${o.id ?? 'x'}`),
  warn: vi.fn(),
});

/** The `name` of every chunk a `buildStart` emitted, in call order. */
// A coordinator is emitted with a pinned `fileName` and no `name` (SDD-45 §4.4): its file
// has to be at the root, where the head names it. Everything else is emitted by name.
const emittedNames = (ctx: { emitFile: ReturnType<typeof vi.fn> }): string[] =>
  ctx.emitFile.mock.calls.map((call) => {
    const emitted = call[0] as { name?: string; fileName?: string };
    return emitted.name ?? emitted.fileName ?? '';
  });

describe('config / configResolved', () => {
  it('config declares the custom shell entry', () => {
    const plugin = fudic() as AnyHook;
    expect(plugin.config({}, { command: 'serve', mode: 'development' })).toMatchObject({ appType: 'custom' });
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
  it('no sw.json: the main bootstrap still hydrates, and no SW is emitted (§4.7, SDD-17 §4.7.1)', async () => {
    const p = setup('build');
    const ctx = emitCtx();
    await p.buildStart.call(ctx);
    const main = p.load(MAIN_ID);
    // It used to be `export {};` here, which made "no Service Worker" mean "no hydration".
    // With no worker, the links name each chunk's graph, which the coordinator carries: the
    // page never asks for the manifest (BUG-53 §4.3).
    expect(main).toContain('warm: $warm({ graph: $graph }),');
    expect(main).not.toContain('fudic-routes.json');
    expect(main).not.toContain('registerRenderServiceWorker');
    // The home wrapper, and no Service Worker chunk. (The client chunks of the three
    // components are also emitted here; `buildStart` below is where they are asserted.)
    // The coordinator is emitted here too now (SDD-45 §4.4): one per combination of pieces,
    // named by a hash of its own source, so the assertion is about its shape and not its name.
    const names = emittedNames(ctx).filter((n) => !n.startsWith('h/'));
    expect(names.filter((n) => !n.startsWith('fudic-main-'))).toEqual(['c/home']);
    expect(names.filter((n) => n.startsWith('fudic-main-'))).toHaveLength(1);
  });

  it('with sw.json: main registers the SW and the SW bootstrap renders locally', async () => {
    const p = setup('build', {}, swRoot());
    await p.buildStart.call(emitCtx());
    // BUG-03 §4.2: a literal URL, the same expression dev uses. `/fudic-sw.js` has a
    // fixed name because a Service Worker only controls its own directory and below.
    // It is the BOOT module that registers it since BUG-31 T2 — the always-on half, loaded
    // by its own tag, so a page with nothing to hydrate still gets its worker.
    expect(p.load(BOOT_ID)).toContain('"/fudic-sw.js"');
    expect(p.load(BOOT_ID)).toContain('registerRenderServiceWorker');
    expect(p.load(MAIN_ID)).not.toContain('registerRenderServiceWorker');
    // The worker deposits the graph: the page reads no manifest and preloads nothing (BUG-53).
    expect(p.load(MAIN_ID)).toContain('warm: $warm(),');
    expect(p.load(MAIN_ID)).not.toContain('$graph');
    expect(p.load(SW_ID)).toContain('createRouter');
    expect(p.load(SW_ID)).toContain('"/style.css"');
    expect(p.load(WRAPPER_PREFIX + '/home')).toContain('htmlToByteStream');
  });

  it('dev does not register the SW unless sw.json asks for it (§4.11), but does hydrate', () => {
    const main = setup('serve', {}, swRoot()).load(MAIN_ID);
    expect(main).not.toContain('registerRenderServiceWorker');
    // Dev is a first-class mode (SDD-17 §4.7.1): the resolver is the dev server's URL and
    // the warm goes through `modulepreload`, so dev is where warm is measurable at all.
    expect(main).toContain("const $chunk = (tag) => $prefix + tag + '.js';");
    expect(main).toContain(
      'warm: $warm(),',
    );
  });

  it('returns null for an unknown wrapper pattern and any other id', () => {
    const p = setup('build'); // no buildStart → builds empty
    expect(p.load(WRAPPER_PREFIX + '/nope')).toBeNull();
    expect(p.load('./x.ts')).toBeNull();
  });
});

describe('buildStart', () => {
  it('emits one wrapper per route — and NOT the SW, which has its own build', async () => {
    const ctx = emitCtx();
    await setup('build', {}, swRoot()).buildStart.call(ctx);
    // BUG-03: `fudic-sw.js` is no longer a chunk of this output, so `buildStart` does
    // not emit it. Code splitting can therefore never share a file between the two.
    expect(emittedNames(ctx).filter((n) => n.startsWith('c/'))).toEqual(['c/home']);
  });

  it('emits one client chunk per component of the graph (SDD-15 §6.8)', async () => {
    const ctx = emitCtx();
    await setup('build', {}, swRoot()).buildStart.call(ctx);
    // Every component the page reaches, with no level filter: which of them hydrates is
    // decided at render time — on the edge and in the Service Worker — with data in hand.
    expect(emittedNames(ctx).filter((n) => n.startsWith('h/')).sort()).toEqual([
      'h/app-actions',
      'h/app-badge',
      'h/app-button',
      'h/app-calendar',
      'h/app-card',
      'h/app-list',
    ]);
  });

  it('skips an excluded route', async () => {
    const ctx = emitCtx();
    await setup('build', { defaults: { '/home': { mode: 'exclude' } } }, swRoot()).buildStart.call(ctx);
    expect(ctx.emitFile).not.toHaveBeenCalled();
  });

  it('warns route diagnostics (FUD0364 default with no match)', async () => {
    const ctx = emitCtx();
    await setup('build', { defaults: { '/nope': { mode: 'exclude' } } }).buildStart.call(ctx);
    // A positioned log since SDD-35 §4.4: the text travels in `message`.
    expect(ctx.warn).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('FUD0364') }));
  });

  it('SDD-35 §4.4 — a typecheck error prints every problem once and fails the build at buildEnd, before the passes', async () => {
    const { config } = fakeDevServerParts();
    const errors: string[] = [];
    const warnings: string[] = [];
    const plugin = fudic({ routesDir: 'fixtures' }) as AnyHook;
    plugin.config({}, { command: 'serve', mode: 'development' });
    plugin.configResolved({
      root,
      base: '/',
      command: 'build',
      build: { outDir: 'dist' },
      logger: { ...config.logger, error: (m: string) => errors.push(m), warn: (m: string) => warnings.push(m) },
    });
    checked.report = {
      problems: [
        { file: toPosix(homeFud), span: span(0, 9), severity: 'error', code: 'TS2322', message: 'first' },
        { file: toPosix(homeFud), span: span(0, 9), severity: 'warning', code: 'TS6133', message: 'second' },
      ],
      project: [FUD0870()],
      inputs: [],
    };
    const ctx = {
      ...emitCtx(),
      error: vi.fn((log: { message: string }): never => {
        throw new Error(log.message);
      }),
    };
    // The check runs beside the bundle: `buildStart` does not wait for it when it has nothing
    // of its own to say. The verdict is waited for at `buildEnd`, the last hook before the
    // link pass, the edge pass and the prerender.
    await plugin.buildStart.call(ctx);
    await expect(plugin.buildEnd.call(ctx)).rejects.toThrow('the typecheck failed: 1 error in 1 file');
    expect(ctx.error).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([expect.stringMatching(/^fixtures\/home\.fud:1:1 - error TS2322: first/u)]);
    expect(warnings).toEqual([
      expect.stringContaining('warning FUD0870'),
      expect.stringMatching(/^fixtures\/home\.fud:1:1 - warning TS6133: second/u),
    ]);
  });

  it('SDD-35 §4.4 — with a diagnostic of its own to say, buildStart lets the typecheck speak first', async () => {
    checked.report = {
      problems: [{ file: toPosix(homeFud), span: span(0, 9), severity: 'error', code: 'TS2322', message: 'first' }],
      project: [],
      inputs: [],
    };
    const ctx = {
      ...emitCtx(),
      error: vi.fn((log: { message: string }): never => {
        throw new Error(log.message);
      }),
    };
    // FUD0364 is a warning `buildStart` reports: before it, the verdict — and it fails.
    await expect(
      setup('build', { defaults: { '/nope': { mode: 'exclude' } } }).buildStart.call(ctx),
    ).rejects.toThrow('the typecheck failed: 1 error in 1 file');
    expect(ctx.warn).not.toHaveBeenCalled();
  });

  it('a build that already failed cancels the check and does not wait for it', async () => {
    const p = setup('build');
    await p.buildStart.call(emitCtx());
    checks.cancelled = 0;
    await expect(p.buildEnd.call(emitCtx(), new Error('the bundle failed'))).resolves.toBeUndefined();
    expect(checks.cancelled).toBe(1);
    // And the next build starts with no check of the last one in flight.
    await expect(p.buildEnd.call(emitCtx())).resolves.toBeUndefined();
  });

  it('a check thread that dies fails the build at buildEnd with its error — not as an unhandled rejection', async () => {
    checks.dies = true;
    try {
      const p = setup('build');
      await p.buildStart.call(emitCtx());
      // Nobody awaits the verdict until `buildEnd`; a tick passes with it rejected.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await expect(p.buildEnd.call(emitCtx())).rejects.toThrow('the check thread died');
    } finally {
      checks.dies = false;
    }
  });

  it('a clean check lets buildEnd through; dev never starts one', async () => {
    const p = setup('build');
    await p.buildStart.call(emitCtx());
    await expect(p.buildEnd.call(emitCtx())).resolves.toBeUndefined();
    checks.started = 0;
    const dev = setup('serve');
    await dev.buildStart.call(emitCtx());
    await expect(dev.buildEnd.call(emitCtx())).resolves.toBeUndefined();
    expect(checks.started).toBe(0);
  });

  it('SDD-35 §4.4 — warnings alone print and do not fail; no logger is not a crash', async () => {
    checked.report = { problems: [], project: [FUD0870()], inputs: [] };
    const ctx = emitCtx();
    await expect(setup('build').buildStart.call(ctx)).resolves.toBeUndefined();
  });

  it('is a no-op in dev (no emitFile)', async () => {
    const ctx = emitCtx();
    await setup('serve').buildStart.call(ctx);
    expect(ctx.emitFile).not.toHaveBeenCalled();
  });
});

interface FakeRes {
  statusCode?: number;
  headers: Record<string, string>;
  body: string;
  setHeader(k: string, v: string): void;
  removeHeader(k: string): void;
  write(b: string | Uint8Array): void;
  end(b?: string): void;
  /** A real `ServerResponse` has it: the dev server listens for `close` to abort the request (SDD-56 §4.12). */
  on(event: string, listener: () => void): FakeRes;
}
const fakeRes = (): FakeRes => ({
  headers: {},
  body: '',
  setHeader(k, v) {
    this.headers[k.toLowerCase()] = v;
  },
  removeHeader(k) {
    delete this.headers[k.toLowerCase()];
  },
  write(b) {
    this.body += typeof b === 'string' ? b : new TextDecoder().decode(b);
  },
  end(b = '') {
    this.body += b;
  },
  on() {
    return this;
  },
});
const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('configureServer middleware', () => {
  async function withServer(
    transformRequest: (id: string) => Promise<{ code: string }>,
  ): Promise<(req: { url: string }, res: FakeRes, next: () => void) => void> {
    let handler!: (req: { url: string }, res: FakeRes, next: () => void) => void;
    const server = {
      ...fakeDevServerParts(),
      middlewares: { use: (fn: typeof handler) => (handler = fn) },
      transformRequest,
    };
    await setup('serve').configureServer(server);
    return handler;
  }

  it('serves the manifest as JSON, every route rendered by the edge in dev', async () => {
    const handler = await withServer(async () => ({ code: '' }));
    const res = fakeRes();
    handler({ url: '/fudic-routes.json' }, res, () => undefined);
    expect(res.headers['content-type']).toContain('application/json');
    expect(JSON.parse(res.body).routes[0]).toMatchObject({ pattern: '/home', mode: 'ssr' });
  });

  it('serves the SW with a root-scope header and its own CSP', async () => {
    const handler = await withServer(async () => ({ code: 'createRouter(...)' }));
    const res = fakeRes();
    handler({ url: '/fudic-sw.js' }, res, () => undefined);
    await flush();
    expect(res.headers['service-worker-allowed']).toBe('/');
    expect(res.headers['content-security-policy']).toContain('unsafe-eval');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.body).toContain('createRouter');
  });

  it('calls next() for an unrelated URL', async () => {
    const handler = await withServer(async () => ({ code: '' }));
    const next = vi.fn();
    handler({ url: '/whatever.css' }, fakeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  // SDD-35 criterion 20. It used to answer `500` with a `// fudic dev: failed…` comment: a
  // script that loaded, did nothing, and showed no overlay and no log.
  it('hands a failing transform of a bootstrap to next(err), for the overlay — not a 500', async () => {
    const boom = Object.assign(new Error('boom'), { loc: { file: homeFud, line: 1, column: 1 }, frame: 'x' });
    const handler = await withServer(() => Promise.reject(boom));
    for (const url of ['/fudic-main.js', '/fudic-boot.js', '/fudic-sw.js']) {
      const res = fakeRes();
      const next = vi.fn();
      handler({ url }, res, next);
      await flush();
      expect(next).toHaveBeenCalledWith(boom);
      expect(res.statusCode).toBeUndefined();
      expect(res.body).toBe('');
    }
  });

  it('hands a failing transform of a component chunk (/@fudic/h/<tag>.js) to next(err)', async () => {
    const boom = new Error('the chunk did not compile');
    const asked: string[] = [];
    const handler = await withServer((id) => {
      asked.push(id);
      return Promise.reject(boom);
    });
    const next = vi.fn();
    const res = fakeRes();
    handler({ url: '/@fudic/h/app-card.js' }, res, next);
    await flush();
    expect(asked[0]).toMatch(/app-card\.fud\?client$/u);
    expect(next).toHaveBeenCalledWith(boom);
    expect(res.body).toBe('');
  });
});

describe('configureServer — the page and the live typecheck (SDD-35 §4.5)', () => {
  type Req = { url: string; method: string; headers: Record<string, string> };
  type Next = (err?: unknown) => void;

  /** The HTML middleware (registered by the post hook), over a fake server. */
  async function htmlMiddleware(): Promise<{
    handle: (req: Req, res: FakeRes, next: Next) => void;
    parts: ReturnType<typeof fakeDevServerParts>;
    close: () => void;
  }> {
    const handlers: Array<(req: Req, res: FakeRes, next: Next) => void> = [];
    const parts = fakeDevServerParts();
    let onClose: (() => void) | undefined;
    const server = {
      ...parts,
      middlewares: { use: (fn: (req: Req, res: FakeRes, next: Next) => void) => handlers.push(fn) },
      httpServer: { once: (_event: string, fn: () => void) => (onClose = fn) },
      transformRequest: async () => ({ code: '' }),
      ssrLoadModule: async () => ({
        render: () =>
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('<!DOCTYPE html><h1>home</h1>'));
              controller.close();
            },
          }),
      }),
      ssrFixStacktrace: vi.fn(),
      transformIndexHtml: async (_url: string, html: string) => html,
    };
    const post = (await setup('serve').configureServer(server)) as () => void;
    post();
    return { handle: handlers[handlers.length - 1]!, parts, close: () => onClose?.() };
  }

  const page = (url: string): Req => ({ url, method: 'GET', headers: { accept: 'text/html' } });

  /** Run the middleware to its end: a response, or a `next`. */
  function run(handle: (req: Req, res: FakeRes, next: Next) => void, req: Req): Promise<{ res: FakeRes; err: unknown; nexted: boolean }> {
    return new Promise((resolve) => {
      const res = fakeRes();
      const end = res.end.bind(res);
      res.end = (body?: string) => {
        end(body);
        resolve({ res, err: undefined, nexted: false });
      };
      handle(req, res, (err?: unknown) => resolve({ res, err, nexted: true }));
    });
  }

  it('criterion 18 — a page whose graph has a type error is not served: next(err) with loc and frame', async () => {
    // The error is in a COMPONENT the page links, not in the page.
    const card = fileURLToPath(new URL('../../compiler/fixtures/app-card.fud', import.meta.url));
    checked.report = {
      problems: [{ file: toPosix(card), span: span(0, 5), severity: 'error', code: 'TS2322', message: 'nope' }],
      project: [],
      inputs: [],
    };
    const { handle, parts, close } = await htmlMiddleware();
    // A page never waits for the check (BUG-51): it is refused once the error is known.
    await vi.waitFor(() => expect(parts.told.sent).toHaveLength(1));
    const { err, nexted, res } = await run(handle, page('/home'));
    expect(nexted).toBe(true);
    expect(res.statusCode).toBeUndefined();
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({
      message: 'TS2322: nope',
      id: toPosix(card),
      plugin: 'fudic',
      loc: { file: toPosix(card), line: 1, column: 1 },
    });
    expect((err as { frame: string }).frame).toContain('─');
    // And the overlay was pushed at start, without a request.
    expect(parts.told.sent).toEqual([{ type: 'error', err: expect.objectContaining({ message: 'TS2322: nope' }) }]);
    close();
  });

  it('an error in a file outside the page’s graph does not block it', async () => {
    const elsewhere = join(tmpdir(), 'not-in-the-graph.fud');
    checked.report = {
      problems: [{ file: toPosix(elsewhere), span: span(0, 1), severity: 'error', code: 'TS2322', message: 'x' }],
      project: [],
      inputs: [],
    };
    const { handle, close } = await htmlMiddleware();
    const { res, nexted } = await run(handle, page('/home'));
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<h1>home</h1>');
    close();
  });

  it('a clean project serves the page', async () => {
    const { handle, close } = await htmlMiddleware();
    const { res } = await run(handle, page('/home'));
    expect(res.statusCode).toBe(200);
    close();
  });

  it('checks in a child process of the project, and closing the server disposes it (BUG-51)', async () => {
    const { close } = await htmlMiddleware();
    expect(child.roots.map((r) => toPosix(r).toLowerCase())).toEqual([toPosix(root).toLowerCase()]);
    expect(child.disposed).toBe(0);
    close();
    expect(child.disposed).toBe(1);
  });

  it('a page is served before the first check ends, and refused once its error is known (BUG-51)', async () => {
    const card = fileURLToPath(new URL('../../compiler/fixtures/app-card.fud', import.meta.url));
    checked.report = {
      problems: [{ file: toPosix(card), span: span(0, 5), severity: 'error', code: 'TS2322', message: 'late' }],
      project: [],
      inputs: [],
    };
    const { handle, parts, close } = await htmlMiddleware();
    // Asked at once: the check is still settling, and the page does not wait for it.
    expect((await run(handle, page('/home'))).res.statusCode).toBe(200);
    await vi.waitFor(() => expect(parts.told.sent).toHaveLength(1));
    expect((await run(handle, page('/home'))).err).toMatchObject({ message: 'TS2322: late' });
    close();
  });

  it('a child that dies is answered by a checker in this process, whose verdict blocks the page', async () => {
    child.dies = true;
    const card = fileURLToPath(new URL('../../compiler/fixtures/app-card.fud', import.meta.url));
    checked.report = {
      problems: [{ file: toPosix(card), span: span(0, 5), severity: 'error', code: 'TS2322', message: 'local' }],
      project: [],
      inputs: [],
    };
    const { handle, parts, close } = await htmlMiddleware();
    await vi.waitFor(() => expect(parts.told.sent).toHaveLength(1));
    const { err, nexted } = await run(handle, page('/home'));
    expect(nexted).toBe(true);
    expect(err).toMatchObject({ message: 'TS2322: local' });
    close();
  });
});

describe('hotUpdate — an edit the server graph sees reloads the browser (BUG-51)', () => {
  /** Run the hook in `environment` over `modules`, and what the client was sent. */
  function hot(environment: string, modules: unknown[], options: Record<string, unknown> = {}): unknown[] {
    const sent: unknown[] = [];
    const server = { environments: { client: { hot: { send: (payload: unknown) => sent.push(payload) } } } };
    // An empty graph: the implementations of SDD-60 §4.4 are invalidated in it, and there are none.
    const moduleGraph = { idToModuleMap: new Map(), invalidateModule: () => undefined };
    setup('serve', options).hotUpdate.call({ environment: { name: environment, moduleGraph } }, { modules, server });
    return sent;
  }

  it('`serverReload: false` reloads nothing: the host reruns by itself, as the workbench does', () => {
    expect(hot('ssr', [{ id: '/src/routes/index.fud' }], { serverReload: false })).toEqual([]);
  });

  it('a module of the ssr graph that changed: a full reload of every page', () => {
    expect(hot('ssr', [{ id: '/src/routes/index.fud' }])).toEqual([{ type: 'full-reload', path: '*' }]);
  });

  it('an ssr update that touches no module of its graph says nothing', () => {
    expect(hot('ssr', [])).toEqual([]);
  });

  it('the client environment has its own HMR: nothing added', () => {
    expect(hot('client', [{ id: '/src/routes/index.fud' }])).toEqual([]);
  });
});

describe('configurePreviewServer middleware', () => {
  // Preview is the production edge, and since SDD-81 it runs what an adapter runs: the
  // `.fudic/edge/server.mjs` of the build, given to `createServer` with the prerendered pages of
  // `outDir`. These build that module by hand, with `emitServerModule`, and drive the two
  // middlewares the plugin registers: the app first, and `_error.fud` as a 404 after Vite's files.
  type Req = { url?: string; method: string; headers: Record<string, string> };
  type Middleware = (req: Req, res: FakeRes, next: (error?: unknown) => void) => void;

  interface Preview {
    readonly app: Middleware;
    readonly notFound: Middleware;
  }

  function withPreview(outDir: string, previewRoot: string, https = false): Preview {
    const used: Middleware[] = [];
    const plugin = fudic({ routesDir: 'fixtures' }) as AnyHook;
    plugin.config({}, { command: 'serve', mode: 'development' });
    plugin.configResolved({ root: previewRoot, base: '/', command: 'build', build: { outDir } });
    const after = plugin.configurePreviewServer({
      config: { preview: { https } },
      middlewares: { use: (fn: Middleware) => used.push(fn) },
    }) as () => void;
    after();
    return { app: used[0]!, notFound: used[1]! };
  }

  const navigation = (url: string): Req => ({ url, method: 'GET', headers: { accept: 'text/html,application/xhtml+xml', host: 'localhost:4173' } });

  /** A response whose end the test can wait for. */
  function endingRes(): FakeRes & { readonly ended: Promise<void> } {
    let done!: () => void;
    const ended = new Promise<void>((r) => (done = r));
    const res = fakeRes();
    const end = res.end.bind(res);
    return Object.assign(res, {
      ended,
      end(b?: string) {
        end(b);
        done();
      },
    });
  }

  /** What `next` was called with, as a promise. */
  function nextCall(): { readonly next: (error?: unknown) => void; readonly called: Promise<unknown> } {
    let resolve!: (error: unknown) => void;
    const called = new Promise<unknown>((r) => (resolve = r));
    return { next: (error?: unknown) => resolve(error), called };
  }

  /**
   * A project root whose `.fudic/edge` holds `server.mjs` and the chunks it names, and an
   * `outDir` beside it.
   */
  function built(input: Partial<ServerModuleInput>, chunks: Record<string, string> = {}): { root: string; outDir: string } {
    const previewRoot = mkdtempSync(join(tmpdir(), 'fudic-preview-root-'));
    const edge = join(previewRoot, '.fudic', 'edge');
    mkdirSync(edge, { recursive: true });
    for (const [file, text] of Object.entries(chunks)) writeFileSync(join(edge, file), text);
    writeFileSync(
      join(edge, 'server.mjs'),
      emitServerModule({
        base: '/',
        locales: [],
        csp: "script-src 'nonce-{nonce}'",
        statics: {},
        routes: [],
        errorPages: [],
        errorHints: [],
        config: {},
        ...input,
      }),
    );
    const outDir = join(previewRoot, 'dist');
    mkdirSync(outDir, { recursive: true });
    return { root: previewRoot, outDir };
  }

  it('BUG-02 §6.13 serves the prerendered file with a CSP and a fresh nonce, without record.html', async () => {
    // The edge locates the file by convention (`htmlPathFor`): the route has no chunk at all.
    const { root: r, outDir } = built({ routes: [{ pattern: '/about', hints: ['</a.css>; rel=preload; as=style'] }] });
    mkdirSync(join(outDir, 'about'), { recursive: true });
    writeFileSync(join(outDir, 'about', 'index.html'), '<script nonce="__FUDIC_NONCE__"></script>');
    const { app } = withPreview(outDir, r);
    const res = endingRes();
    app(navigation('/about'), res, () => expect.unreachable('should not fall through'));
    await res.ended;
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('__FUDIC_NONCE__');
    const nonce = /nonce="([^"]+)"/u.exec(res.body)?.[1] ?? '';
    expect(nonce).not.toBe('');
    expect(res.headers['content-security-policy']).toContain(`'nonce-${nonce}'`);
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['link']).toBe('</a.css>; rel=preload; as=style');
  });

  it('BUG-02 the generated data endpoint answers for an `ssg` route too', async () => {
    const { root: r, outDir } = built(
      { routes: [{ pattern: '/about', hints: [], file: 'about.js' }] },
      { 'about.js': 'export function data(ctx) { return Promise.resolve(new Response(ctx.url.pathname).body); }\nexport function render() {}\n' },
    );
    const { app } = withPreview(outDir, r);
    const res = endingRes();
    app({ url: '/_fudic/data/about', method: 'GET', headers: {} }, res, () => expect.unreachable('should not fall through'));
    await res.ended;
    // The frames as the wrapper wrote them, passed on untouched (SDD-70 §3.7).
    expect(res.body).toBe('/about');
    expect(res.headers['content-type']).toBe('application/fud+frames');
  });

  it('SDD-70 criterion 17: preview sends what is rendered before the rest is ready', async () => {
    const { root: r, outDir } = built(
      { routes: [{ pattern: '/espera', hints: [], file: 'espera.js' }] },
      {
        'espera.js': [
          'export function render() {',
          '  const enc = new TextEncoder();',
          '  return new ReadableStream({ async start(c) {',
          "    c.enqueue(enc.encode('<html><head></head><body><h1>t</h1><!--fud-end-->'));",
          '    await globalThis.__sdd70preview;',
          "    c.enqueue(enc.encode('<p>tarde</p></body></html>'));",
          '    c.close();',
          '  } });',
          '}',
          '',
        ].join('\n'),
      },
    );
    let release!: () => void;
    (globalThis as { __sdd70preview?: Promise<void> }).__sdd70preview = new Promise<void>((done) => (release = done));
    const { app } = withPreview(outDir, r);
    const res = endingRes();
    app(navigation('/espera'), res, () => expect.unreachable('should not fall through'));
    await vi.waitFor(() => expect(res.body).toContain('<h1>t</h1><!--fud-end-->'), { timeout: 5000 });
    expect(res.body).not.toContain('tarde');
    release();
    await res.ended;
    expect(res.body).toContain('<p>tarde</p></body></html>');
  });

  it('falls through for an unknown route, a non-GET, and a route with no output', async () => {
    const { root: r, outDir } = built({ routes: [{ pattern: '/blog', hints: [] }] });
    const { app } = withPreview(outDir, r);
    for (const req of [navigation('/blog'), navigation('/nope'), { url: '/', method: 'POST', headers: { accept: 'text/html' } }]) {
      const { next, called } = nextCall();
      app(req, fakeRes(), next);
      expect(await called).toBeUndefined();
    }
  });

  it('falls through when the build left no server.mjs', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'fudic-empty-'));
    const { app, notFound } = withPreview(join(empty, 'dist'), empty);
    for (const mw of [app, notFound]) {
      const { next, called } = nextCall();
      mw(navigation('/about'), fakeRes(), next);
      expect(await called).toBeUndefined();
    }
  });

  it('SDD-73 §4.3: after Vite’s files, a navigation nothing answered is _error.fud as a 404', async () => {
    const { root: r, outDir } = built({});
    const { notFound } = withPreview(outDir, r);
    const res = endingRes();
    notFound(navigation('/nope'), res, () => expect.unreachable('should not fall through'));
    await res.ended;
    expect(res.statusCode).toBe(404);
    // No `_error.fud` in this build: the minimal page.
    expect(res.body).toContain('<h1>404</h1>');
  });

  it('the app’s own static files get their headers and go on to Vite', async () => {
    const { root: r, outDir } = built({ statics: { '/sw.js': { 'cache-control': 'no-cache' } } });
    const { app } = withPreview(outDir, r);
    const res = fakeRes();
    const { next, called } = nextCall();
    app({ url: '/sw.js', method: 'GET', headers: {} }, res, next);
    await called;
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('criterion 43: preview over http hands the functions Secure-less cookies, and a secret of its own', async () => {
    const handler = 'export const handler = (o) => async () => new Response(JSON.stringify({ secure: o.secureCookies, secret: typeof o.secret }));\n';
    const { root: r, outDir } = built({ functions: 'functions.mjs' }, { 'functions.mjs': handler });
    for (const https of [false, true]) {
      const { app } = withPreview(outDir, r, https);
      const res = endingRes();
      app({ url: '/_fudic/fn/x', method: 'POST', headers: { host: '192.168.1.20:4173' } }, res, () => expect.unreachable('a function'));
      await res.ended;
      expect(JSON.parse(res.body)).toEqual({ secure: https, secret: 'string' });
    }
  });

  it('SDD-81 §3.5: preview hands the functions fudic.json’s upload limits and the disk spool of Node', async () => {
    const handler = 'export const handler = (o) => async () => new Response(JSON.stringify({ uploads: o.uploads, spool: o.spool?.name }));\n';
    const { root: r, outDir } = built({ functions: 'functions.mjs', config: { uploads: { maxFiles: 3, maxFileSize: 1024 } } }, { 'functions.mjs': handler });
    const { app } = withPreview(outDir, r);
    const res = endingRes();
    app({ url: '/_fudic/fn/x', method: 'POST', headers: {} }, res, () => expect.unreachable('a function'));
    await res.ended;
    expect(JSON.parse(res.body)).toEqual({ uploads: { maxFiles: 3, maxFileSize: 1024 }, spool: 'diskSpool' });
  });

  it('a server.mjs that fails to load goes to next(error)', async () => {
    const { root: r, outDir } = built({ routes: [{ pattern: '/x', hints: [], file: 'x.js' }] });
    writeFileSync(join(r, '.fudic', 'edge', 'server.mjs'), 'throw new Error("broken server.mjs");\n');
    const { app } = withPreview(outDir, r);
    const { next, called } = nextCall();
    app(navigation('/x'), fakeRes(), next);
    expect(String(await called)).toContain('broken server.mjs');
  });
});

describe('transform', () => {
  it('ignores non-.fud ids', async () => {
    expect(await setup('build').transform.call(emitCtx(), '', '/x.ts')).toBeNull();
  });
});
