/**
 * `fudic_preview` and `fudic_call` (SDD-78 §4.2, §4.3): what the tools do with the dev server's
 * state and with what the project's runners answer. The site, the runners and the project service
 * are stand-ins; `preview-e2e.test.ts` runs them for real.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Piece, ProjectService } from '@fudic/language-server/project';
import { callTool, type CallDeps } from '../src/call.js';
import type { Checks } from '../src/checks.js';
import type { DevError, DevState } from '../src/dev-server.js';
import type { Runners } from '../src/fudic.js';
import { previewTool, type PreviewDeps } from '../src/preview.js';
import { openProject, type Project } from '../src/project.js';
import type { Site } from '../src/site.js';
import { tempDir } from './helpers.js';

let dir: ReturnType<typeof tempDir>;
let root: string;
let project: Project;

const SOURCE = 'export function save() {\n  throw new Error("down");\n}\n';

beforeAll(() => {
  dir = tempDir();
  root = dir.root;
  for (const [path, text] of Object.entries({
    'fudic.json': '{}',
    'vite.config.ts': '',
    'node_modules/vite/package.json': '{"name":"vite"}',
    'node_modules/@fudic/vite/package.json': '{"name":"@fudic/vite"}',
    'src/server/routes/products.ts': SOURCE,
  })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  project = openProject(root, () => 'b59fa7d');
});

afterAll(() => dir.dispose());

const route = (name: string): Piece => ({ kind: 'route', name, file: `/p${name}.fud`, servers: [], documented: { doc: false, props: 0, documented: 0 } });

const FUNCTIONS = [
  { name: 'routes/products.save', state: 'connected', file: 'src/routes/products.fudapi' },
  { name: 'routes/products/[id].remove', state: 'connected', file: 'src/routes/products/[id].fudapi' },
  { name: 'routes/products.search', state: 'missing', file: 'src/routes/products.fudapi' },
];

function checks(pieces: readonly Piece[] = [route('/'), route('/productos'), route('/productos/:id')]): Checks {
  const service = { pieces: () => pieces, symbols: () => FUNCTIONS } as unknown as ProjectService;
  return { service: async () => service } as unknown as Checks;
}

interface FakeSite extends Site {
  readonly waited: (number | undefined)[];
}

function site(state: DevState, over: { errors?: DevError[]; app?: string; public?: boolean } = {}): FakeSite {
  const waited: (number | undefined)[] = [];
  let errors = over.errors ?? [];
  return {
    waited,
    dev: {
      app: over.app ?? root,
      failure: 'port 4318 is in use',
      ready: async (ms?: number) => {
        waited.push(ms);
        return state;
      },
      takeErrors: () => {
        const out = errors;
        errors = [];
        return out;
      },
    } as unknown as Site['dev'],
    urls: (to) => ({ local: `http://127.0.0.1:4318${to}`, ...(over.public ? { public: `https://x.trycloudflare.com${to}` } : {}) }),
    callTarget: () => ({ origin: 'http://127.0.0.1:4318', headers: { cookie: 'fudic-preview=v' } }),
    shotUrl: () => undefined,
    shotOrigins: () => [],
  };
}

const ROUTES = ['/', '/productos', '/productos/1', '/productos/2'];

function runners(over: Partial<Runners> = {}, routes: unknown = { kind: 'routes', routes: ROUTES }): { deps: PreviewDeps & CallDeps; asked: unknown[] } {
  const asked: unknown[] = [];
  return {
    asked,
    deps: {
      runners: async (r) => {
        asked.push(['runners', r]);
        return {
          listRoutes: async (options: unknown) => {
            asked.push(['listRoutes', options]);
            return routes;
          },
          ...over,
        } as unknown as Runners;
      },
      waitMs: 5,
    },
  };
}

describe('fudic_preview', () => {
  it('outside a fudic project: FUD1404', async () => {
    const outside = tempDir();
    try {
      const answer = await previewTool(openProject(outside.root, () => 'x'), checks(), site('ready'), {}, runners().deps);
      expect(answer).toMatchObject({ failed: true, diagnostics: [{ code: 'FUD1404' }] });
    } finally {
      outside.dispose();
    }
  });

  it('an app with no vite.config: FUD1207 saying so, and nothing runs', async () => {
    const bare = tempDir({ 'fudic.json': '{}' });
    try {
      const { deps, asked } = runners();
      const answer = await previewTool(project, checks(), site('ready', { app: bare.root }), {}, deps);
      expect(answer).toEqual({ body: {}, diagnostics: [expect.objectContaining({ code: 'FUD1207', message: expect.stringContaining('no vite.config.ts') })], failed: true });
      expect(asked).toEqual([]);
    } finally {
      bare.dispose();
    }
  });

  it('without listRoutes in the project\'s @fudic/testing: FUD1207', async () => {
    const answer = await previewTool(project, checks(), site('ready'), {}, runners({ listRoutes: undefined } as unknown as Partial<Runners>).deps);
    expect(answer.diagnostics?.[0]).toMatchObject({ code: 'FUD1207', message: expect.stringContaining('pnpm add -D @fudic/testing') });
  });

  it('the routes that did not compile: the diagnostics of the run', async () => {
    const broken = { kind: 'broken', diagnostics: [{ code: 'FUD0540', severity: 'error', message: 'key', file: 'src/x.fud', line: 1, column: 1 }] };
    const answer = await previewTool(project, checks(), site('ready'), {}, runners({}, broken).deps);
    expect(answer).toEqual({ body: {}, diagnostics: [{ code: 'FUD0540', severity: 'error', message: 'key' }], failed: true });
  });

  it('ready: its URLs at /, the routes, the errors thrown once, and the next that gives the URL', async () => {
    const file = join(root, 'src/server/routes/products.ts');
    const s = site('ready', {
      errors: [
        { message: 'down', stack: `Error: down\n    at save (${file}:2:3)` },
        { message: 'elsewhere', stack: 'Error: elsewhere\n    at x (/nowhere/x.ts:1:1)' },
      ],
    });
    const { deps, asked } = runners();
    const answer = await previewTool(project, checks([route('/'), route('/productos')]), s, {}, deps);
    expect(asked).toEqual([['runners', root], ['listRoutes', { root }]]);
    expect(s.waited).toEqual([5]);
    const start = SOURCE.indexOf('throw');
    expect(answer).toEqual({
      body: { state: 'ready', local: 'http://127.0.0.1:4318/', routes: ROUTES },
      diagnostics: [
        expect.objectContaining({ code: 'FUD1425', message: 'the server failed while previewing: down', file, span: { start, end: start } }),
        expect.objectContaining({ code: 'FUD1425', message: 'the server failed while previewing: elsewhere' }),
      ],
      next: 'Give the user the local URL. Opening it is how they see the app; it does not approve anything.',
    });
    expect(answer.diagnostics?.[1]).not.toHaveProperty('file');
    // Once: the next call does not say them again.
    expect((await previewTool(project, checks([route('/')]), s, {}, deps)).diagnostics).toEqual([]);
  });

  it('with the tunnel up: the public URL too, and the next gives that one', async () => {
    const answer = await previewTool(project, checks([route('/')]), site('ready', { public: true }), { route: '/' }, runners().deps);
    expect(answer.body).toEqual({ state: 'ready', local: 'http://127.0.0.1:4318/', public: 'https://x.trycloudflare.com/', routes: ROUTES });
    expect(answer.next).toBe('Give the user the public URL. Opening it is how they see the app; it does not approve anything.');
  });

  it('route chooses where it opens: a concrete URL of a route', async () => {
    const answer = await previewTool(project, checks(), site('ready'), { route: '/productos/2' }, runners().deps);
    expect(answer.body).toMatchObject({ local: 'http://127.0.0.1:4318/productos/2' });
  });

  it('a route with params and no paths(): the next says to open it with values', async () => {
    const one = await previewTool(project, checks([route('/'), route('/clientes/:id')]), site('ready'), {}, runners().deps);
    expect(one.next).toMatch(/does not approve anything\. \/clientes\/:id has params and no paths\(\): open it with concrete values\.$/u);
    const two = await previewTool(project, checks([route('/clientes/:id'), route('/pedidos/:id'), route('/productos/:id')]), site('ready'), {}, runners().deps);
    expect(two.next).toMatch(/\/clientes\/:id, \/pedidos\/:id have params and no paths\(\): open them with concrete values\.$/u);
  });

  it('a URL no route answers: FUD1422 with nothing to try; a pattern: FUD1422 with its paths()', async () => {
    const none = await previewTool(project, checks(), site('ready'), { route: '/nada/aqui' }, runners().deps);
    expect(none).toEqual({ body: { route: '/nada/aqui' }, diagnostics: [expect.objectContaining({ code: 'FUD1422', message: '/nada/aqui is not a concrete URL of a route' })], failed: true });
    const pattern = await previewTool(project, checks(), site('ready'), { route: '/productos/:id' }, runners().deps);
    expect(pattern.diagnostics?.[0]).toMatchObject({ code: 'FUD1422', message: expect.stringContaining('try one of: /productos/1, /productos/2') });
  });

  it('it did not start: FUD1424 with what Vite said', async () => {
    const answer = await previewTool(project, checks(), site('failed'), {}, runners().deps);
    expect(answer).toEqual({ body: { state: 'failed' }, diagnostics: [expect.objectContaining({ code: 'FUD1424', message: 'the preview did not start: port 4318 is in use' })], failed: true });
  });

  it('still starting: the state, the routes, and to call again', async () => {
    const answer = await previewTool(project, checks(), site('starting'), {}, runners().deps);
    expect(answer).toEqual({ body: { state: 'starting', routes: ROUTES }, next: 'The preview is still starting: call fudic_preview again in a moment.' });
  });
});

describe('fudic_call', () => {
  const call = (fn: string, s: Site = site('ready'), over: Partial<Runners> = {}, extra: { args?: unknown; params?: Record<string, string> } = {}) => {
    const r = runners(over);
    return { r, answer: callTool(project, checks(), s, { fn, ...extra }, r.deps) };
  };

  it('outside a fudic project: FUD1404', async () => {
    const outside = tempDir();
    try {
      expect(await callTool(openProject(outside.root, () => 'x'), checks(), site('ready'), { fn: 'x.y' }, runners().deps)).toMatchObject({ diagnostics: [{ code: 'FUD1404' }] });
    } finally {
      outside.dispose();
    }
  });

  it('a function that does not exist: FUD1405 with the closest, or alone', async () => {
    expect(await call('routes/products.sav').answer).toEqual({
      body: { fn: 'routes/products.sav' },
      diagnostics: [expect.objectContaining({ code: 'FUD1405', message: 'nothing in the project is called routes/products.sav; did you mean routes/products.save?' })],
      failed: true,
    });
    expect((await call('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzz').answer).diagnostics?.[0]?.message).toBe('nothing in the project is called zzzzzzzzzzzzzzzzzzzzzzzzzzzzzz');
  });

  it('a function with no handler: FUD1423 and fudic_contract, without calling', async () => {
    const callFunction = async () => {
      throw new Error('called');
    };
    const { r, answer } = call('routes/products.search', site('ready'), { callFunction } as unknown as Partial<Runners>);
    expect(await answer).toEqual({
      body: { fn: 'routes/products.search' },
      diagnostics: [expect.objectContaining({ code: 'FUD1423', message: 'routes/products.search has no handler yet' })],
      failed: true,
      next: 'fudic_contract { id: "routes/products" } says what to write.',
    });
    expect(r.asked).toEqual([]);
  });

  it('an app that cannot be served, or a @fudic/testing with no callFunction: FUD1207', async () => {
    const bare = tempDir({ 'fudic.json': '{}' });
    try {
      expect((await call('routes/products.save', site('ready', { app: bare.root })).answer).diagnostics?.[0]).toMatchObject({ code: 'FUD1207', message: expect.stringContaining('no vite.config.ts') });
    } finally {
      bare.dispose();
    }
    expect((await call('routes/products.save').answer).diagnostics?.[0]).toMatchObject({ code: 'FUD1207', message: expect.stringContaining('pnpm add -D @fudic/testing') });
  });

  /** A project whose callFunction answers `result`, and remembers what it was asked. */
  function answering(result: unknown) {
    const asked: unknown[] = [];
    return { asked, callFunction: async (options: unknown) => (asked.push(options), result) } as unknown as Partial<Runners> & { asked: unknown[] };
  }

  it('a dev server that did not start: FUD1424; one still starting: call again', async () => {
    const over = answering({});
    expect((await call('routes/products.save', site('failed'), over).answer)).toMatchObject({ failed: true, diagnostics: [{ code: 'FUD1424' }] });
    expect(await call('routes/products.save', site('starting'), over).answer).toEqual({
      body: { fn: 'routes/products.save', state: 'starting' },
      next: 'The dev server is still starting: call fudic_call again in a moment.',
    });
    expect(over.asked).toEqual([]);
  });

  it('an answer: its status and value; the id, the name, the args, the params and the target go to the call', async () => {
    const over = answering({ kind: 'answered', status: 200, value: { id: 7 } });
    const s = site('ready');
    const answer = await call('routes/products/[id].remove', s, over, { args: { force: true }, params: { id: '7' } }).answer;
    expect(over.asked).toEqual([
      { root, id: 'routes/products/[id]', name: 'remove', origin: 'http://127.0.0.1:4318', headers: { cookie: 'fudic-preview=v' }, args: { force: true }, params: { id: '7' } },
    ]);
    expect(answer).toEqual({ body: { fn: 'routes/products/[id].remove', status: 200, value: { id: 7 } } });

    const bare = answering({ kind: 'answered', status: 204, value: null });
    await call('routes/products.save', s, bare).answer;
    expect(bare.asked[0]).not.toHaveProperty('args');
    expect(bare.asked[0]).not.toHaveProperty('params');
  });

  it('a Problem is an answer, not an error; a 5xx sends to fix the handler', async () => {
    const problem = { type: 'about:blank', title: 'Unauthorized', status: 401 };
    expect(await call('routes/products.save', site('ready'), answering({ kind: 'problem', status: 401, problem })).answer).toEqual({
      body: { fn: 'routes/products.save', status: 401, problem },
      next: null,
    });
    const crash = { title: 'Internal Server Error', status: 500 };
    const answer = await call('routes/products.save', site('ready'), answering({ kind: 'problem', status: 500, problem: crash })).answer;
    expect(answer.failed).toBeUndefined();
    expect(answer.next).toBe('Fix the handler of routes/products.save in src/server/routes/products.ts.');
  });

  it('the call did not compile: its diagnostics; it threw: FUD1420 at the function', async () => {
    const broken = { kind: 'broken', diagnostics: [{ code: 'FUD1207', severity: 'error', message: 'did not run', file: null, line: null, column: null }] };
    expect(await call('routes/products.save', site('ready'), answering(broken)).answer).toEqual({
      body: { fn: 'routes/products.save' },
      diagnostics: [{ code: 'FUD1207', severity: 'error', message: 'did not run' }],
      failed: true,
    });
    const threw = await call('routes/products.save', site('ready'), answering({ kind: 'threw', message: 'ECONNREFUSED' })).answer;
    expect(threw.diagnostics?.[0]).toMatchObject({ code: 'FUD1420', message: 'routes/products.save threw while rendering: ECONNREFUSED', file: 'src/routes/products.fudapi' });
  });
});
