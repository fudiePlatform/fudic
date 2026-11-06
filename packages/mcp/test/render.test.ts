/**
 * `fudic_render` (SDD-78 §4.1): what the tool does with what the project's runners answer. The
 * runners are stand-ins here, and so is the project service: every outcome of a render, and every
 * way of not getting to one, turned into the answer and its diagnostics. The real render, from
 * end to end, is in `render-e2e.test.ts`.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Piece, ProjectService } from '@fudic/language-server/project';
import type { RenderPieceOptions, RenderPieceResult } from '@fudic/testing/run';
import type { BrowserRender, BrowserRenderInput } from '@fudic/workbench';
import { VIEW_META_KEY } from '../src/apps.js';
import type { Checks } from '../src/checks.js';
import { loadRunners, type Runners } from '../src/fudic.js';
import { openProject, type Project } from '../src/project.js';
import { renderTool, type RenderInput } from '../src/render.js';
import { RunQueue } from '../src/runs.js';
import { tempDir } from './helpers.js';

let dir: ReturnType<typeof tempDir>;
let root: string;
let project: Project;
const queue = new RunQueue();

const at = (path: string): string => join(root, path).replace(/\\/gu, '/');

const piece = (kind: Piece['kind'], name: string, file: string, sibling?: string): Piece => ({
  kind,
  name,
  file,
  servers: [],
  ...(sibling !== undefined ? { sibling } : {}),
  documented: { doc: false, props: 0, documented: 0 },
});

const LOAD_SOURCE = 'export function load() {\n  throw new Error("down");\n}\n';

beforeAll(() => {
  dir = tempDir();
  root = dir.root;
  for (const [path, text] of Object.entries({
    'fudic.json': '{}',
    'src/routes/index.fud': '',
    'src/components/acme-button/acme-button.fud': '',
    'src/components/acme-button/acme-button.fixture.ts': 'export default {};',
    'src/components/acme-card/acme-card.fud': '',
    'src/server/routes.ts': LOAD_SOURCE,
  })) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  project = openProject(root, () => 'b59fa7d');
});

afterAll(() => dir.dispose());

function pieces(): readonly Piece[] {
  return [
    piece('component', 'acme-button', at('src/components/acme-button/acme-button.fud')),
    piece('component', 'acme-card', at('src/components/acme-card/acme-card.fud')),
    piece('route', '/', at('src/routes/index.fud'), 'routes/index'),
    piece('route', '/productos/:id', at('src/routes/productos/[id].fud'), 'routes/productos/[id]'),
    piece('route', '/sin', at('src/routes/sin.fud')),
    piece('route', '/vacia', at('src/routes/vacia.fud'), 'routes/vacia'),
  ];
}

/** The handlers each `.fudapi` declares: `routes/vacia` is one the service does not know. */
const HANDLERS: Readonly<Record<string, readonly { name: string; kind: string }[]>> = {
  'routes/index': [{ name: 'routes/index.other', kind: 'get' }],
  'routes/productos/[id]': [
    { name: 'routes/productos/[id].paths', kind: 'paths' },
    { name: 'routes/productos/[id].load', kind: 'load' },
  ],
};

/** The service and the folders a `Checks` gives, with `missing` the functions without a handler. */
function checks(missing: readonly string[] = [], folders: readonly string[] = [root]): Checks {
  const state = (name: string): string => (missing.includes(name) ? 'missing' : 'connected');
  const service = {
    pieces,
    symbols: (kind: string) => {
      expect(kind).toBe('functions');
      return [...missing.map((name) => ({ name, state: 'missing' })), { name: 'routes/index.other', state: 'connected' }];
    },
    handlers: (id: string) => HANDLERS[id]?.map((h) => ({ ...h, state: state(h.name) })),
  } as unknown as ProjectService;
  return { service: async () => service, folders: async () => folders } as unknown as Checks;
}

interface Asked {
  readonly piece: RenderPieceOptions[];
  readonly browser: BrowserRenderInput[];
  readonly roots: string[];
}

/** Runners that answer `piece` and `browser`, and remember what they were asked. */
function runners(over: { piece?: RenderPieceResult; browser?: BrowserRender; none?: boolean } = {}): { deps: { runners: (r: string) => Promise<Runners> }; asked: Asked } {
  const asked: Asked = { piece: [], browser: [], roots: [] };
  const found: Runners = over.none
    ? {}
    : {
        renderPiece: async (options: RenderPieceOptions) => {
          asked.piece.push(options);
          return over.piece ?? RENDERED;
        },
        renderInBrowser: async (input: BrowserRenderInput) => {
          asked.browser.push(input);
          return over.browser ?? { kind: 'rendered', outline: '- button "Save"', html: '<button>Save</button>', errors: [] };
        },
      } as unknown as Runners;
  return {
    asked,
    deps: {
      runners: async (r) => {
        asked.roots.push(r);
        return found;
      },
    },
  };
}

const RENDERED: RenderPieceResult = {
  kind: 'rendered',
  outline: '- button "Save" [disabled]',
  html: '<acme-button><template shadowrootmode="open"><button disabled="">Save</button></template></acme-button>',
  preview: '<!doctype html><html><head></head><body>…</body></html>',
  calls: [],
};

const input = (over: Partial<RenderInput>): RenderInput => ({ as: 'outline', engine: 'happy-dom', ...over });

describe('before painting', () => {
  it('outside a fudic project: FUD1404', async () => {
    const outside = tempDir();
    try {
      const answer = await renderTool(openProject(outside.root, () => 'x'), checks(), queue, input({ component: 'acme-button' }), runners().deps);
      expect(answer).toMatchObject({ failed: true, diagnostics: [{ code: 'FUD1404' }] });
    } finally {
      outside.dispose();
    }
  });

  it('a component that is not there: FUD1405 with the closest, and nothing runs', async () => {
    const { deps, asked } = runners();
    const answer = await renderTool(project, checks(), queue, input({ component: 'acme-buton' }), deps);
    expect(answer).toEqual({
      body: { component: 'acme-buton', engine: 'happy-dom', as: 'outline' },
      diagnostics: [expect.objectContaining({ code: 'FUD1405', message: expect.stringContaining('acme-button') })],
      failed: true,
    });
    expect(asked.roots).toEqual([]);
  });

  it('without @fudic/testing in the project: FUD1207 saying what to install', async () => {
    const answer = await renderTool(project, checks(), queue, input({ component: 'acme-button' }), runners({ none: true }).deps);
    expect(answer.failed).toBe(true);
    expect(answer.diagnostics?.[0]).toMatchObject({ code: 'FUD1207', message: expect.stringContaining('pnpm add -D @fudic/testing') });
  });

  it('a fixture case asked of a component that has no fixture: FUD1421 with no cases', async () => {
    const { deps, asked } = runners();
    const answer = await renderTool(project, checks(), queue, input({ component: 'acme-card', fixture: 'primary' }), deps);
    expect(answer).toMatchObject({ failed: true, diagnostics: [{ code: 'FUD1421', message: expect.stringContaining('has no case "primary"') }] });
    expect(asked.piece).toEqual([]);
  });
});

describe('with happy-dom', () => {
  it('a component: its file, its fixture, the case and the props go to the run, in the folder that holds it', async () => {
    const { deps, asked } = runners();
    const answer = await renderTool(
      project,
      checks([], [join(root, 'other'), root]),
      queue,
      input({ component: 'acme-button', fixture: 'disabled', props: { label: 'Keep' }, select: 'button' }),
      deps,
    );
    expect(asked.roots).toEqual([root]);
    expect(asked.piece).toEqual([
      {
        root,
        target: {
          component: at('src/components/acme-button/acme-button.fud'),
          fixture: join(root, 'src/components/acme-button/acme-button.fixture').replace(/\\/gu, '/') + '.ts',
          case: 'disabled',
          props: { label: 'Keep' },
        },
        select: 'button',
      },
    ]);
    expect(answer).toEqual({
      body: { component: 'acme-button', fixture: 'disabled', engine: 'happy-dom', as: 'outline', outline: RENDERED.outline, calls: [] },
      diagnostics: [],
      next: null,
      meta: { [VIEW_META_KEY]: { kind: 'render', html: RENDERED.preview } },
    });
  });

  it('a component without fixture or props: only its file', async () => {
    const { deps, asked } = runners();
    await renderTool(project, checks(), queue, input({ component: 'acme-card' }), deps);
    expect(asked.piece[0]).toEqual({ root, target: { component: at('src/components/acme-card/acme-card.fud') } });
  });

  it('as html: the markup under its own name, and no outline', async () => {
    const answer = await renderTool(project, checks(), queue, input({ component: 'acme-button', as: 'html' }), runners().deps);
    expect(answer.body).toMatchObject({ as: 'html', html: (RENDERED as { html: string }).html });
    expect(answer.body).not.toHaveProperty('outline');
  });

  it('a route: its URL, its status, and what it called by name — or by path when it has none', async () => {
    const { deps, asked } = runners({
      piece: {
        ...RENDERED,
        status: 200,
        calls: [
          { method: 'GET', path: '/_fudic/fn/routes/index/other', status: 200, fn: 'routes/index.other' },
          { method: 'GET', path: '/_fudic/fn/nowhere', status: 404 },
        ],
      },
    });
    const answer = await renderTool(project, checks(), queue, input({ route: '/' }), deps);
    expect(asked.piece[0]).toEqual({ root, target: { route: '/' } });
    expect(answer.body).toMatchObject({
      route: '/',
      status: 200,
      calls: [
        { fn: 'routes/index.other', status: 200 },
        { fn: '/_fudic/fn/nowhere', status: 404 },
      ],
    });
    expect(answer.diagnostics).toEqual([]);
    expect(answer.next).toBeNull();
  });

  it('neither component nor route: the route /', async () => {
    const { deps, asked } = runners();
    const answer = await renderTool(project, checks(), queue, input({}), deps);
    expect(answer.body).toMatchObject({ route: '/' });
    expect(asked.piece[0]?.target).toEqual({ route: '/' });
  });

  it('a call to a function without handler: its 404 and FUD1423, once however many times it was called', async () => {
    const fn = 'components/acme-button/acme-button.find';
    const call = { method: 'GET', path: '/_fudic/fn/components/acme-button/acme-button/find', status: 404, fn };
    const answer = await renderTool(project, checks([fn]), queue, input({ component: 'acme-button' }), runners({ piece: { ...RENDERED, calls: [call, call] } }).deps);
    expect(answer.body).toMatchObject({ calls: [{ fn, status: 404 }, { fn, status: 404 }] });
    expect(answer.diagnostics).toEqual([expect.objectContaining({ code: 'FUD1423', message: `${fn} has no handler yet` })]);
    expect(answer.next).toBe(`${fn} has no handler yet: fudic_contract says what to write.`);
    expect(answer.failed).toBeUndefined();
  });

  it("a route's load is a call of its render, with the page's status, connected or not", async () => {
    const load = 'routes/productos/[id].load';
    const connected = await renderTool(project, checks(), queue, input({ route: '/productos/7' }), runners({ piece: { ...RENDERED, status: 200 } }).deps);
    expect(connected.body).toMatchObject({ status: 200, calls: [{ fn: load, status: 200 }] });
    expect(connected.diagnostics).toEqual([]);
    expect(connected.next).toBeNull();

    // Without its handler: its 404, FUD1423 and the next that sends to fudic_contract.
    const call = { method: 'GET', path: '/_fudic/fn/x', status: 200 };
    const missing = await renderTool(project, checks([load]), queue, input({ route: '/productos/7' }), runners({ piece: { ...RENDERED, status: 404, calls: [call] } }).deps);
    expect(missing.body).toMatchObject({ status: 404, calls: [{ fn: load, status: 404 }, { fn: '/_fudic/fn/x', status: 200 }] });
    expect(missing.diagnostics).toEqual([expect.objectContaining({ code: 'FUD1423', message: `${load} has no handler yet` })]);
    expect(missing.next).toBe(`${load} has no handler yet: fudic_contract says what to write.`);
  });

  it('no load call: a .fudapi with no load, one the service does not know, no .fudapi, no route, a component', async () => {
    for (const asked of [{ route: '/' }, { route: '/vacia' }, { route: '/sin' }, { route: '/nada/aqui' }, { component: 'acme-card' }]) {
      const answer = await renderTool(project, checks(), queue, input(asked), runners({ piece: { ...RENDERED, status: 404 } }).deps);
      expect(answer.body).toMatchObject({ calls: [] });
      expect(answer.diagnostics).toEqual([]);
    }
  });

  it('nothing matches select: an empty outline or html, and a next that says so', async () => {
    for (const as of ['outline', 'html'] as const) {
      const answer = await renderTool(project, checks(), queue, input({ component: 'acme-card', as, select: '.nope' }), runners({ piece: { kind: 'no-match', select: '.nope' } }).deps);
      expect(answer).toEqual({
        body: { component: 'acme-card', engine: 'happy-dom', as, [as]: '', calls: [] },
        next: 'Nothing in it matches .nope.',
      });
    }
  });

  it('a case the fixture has not: FUD1421 with the cases it has', async () => {
    const answer = await renderTool(project, checks(), queue, input({ component: 'acme-button', fixture: 'big' }), runners({ piece: { kind: 'no-case', cases: ['primary', 'disabled'] } }).deps);
    expect(answer).toMatchObject({ failed: true, diagnostics: [{ code: 'FUD1421', message: expect.stringContaining('its cases are: primary, disabled') }] });
  });

  it('a pattern: FUD1422 with the URLs of its paths()', async () => {
    const answer = await renderTool(project, checks(), queue, input({ route: '/productos/:id' }), runners({ piece: { kind: 'no-route', paths: ['/productos/1'] } }).deps);
    expect(answer).toMatchObject({ failed: true, diagnostics: [{ code: 'FUD1422', message: expect.stringContaining('try one of: /productos/1') }] });
  });

  it('a file that did not compile: the diagnostics of the run, placed when they have a file', async () => {
    const answer = await renderTool(
      project,
      checks(),
      queue,
      input({ component: 'acme-button' }),
      runners({
        piece: {
          kind: 'broken',
          diagnostics: [
            { code: 'FUD0540', severity: 'error', message: 'key', file: 'src/components/acme-button/acme-button.fud', line: 3, column: 1 },
            { code: 'FUD1207', severity: 'error', message: 'the render did not run', file: null, line: null, column: null },
          ],
        },
      }).deps,
    );
    expect(answer).toEqual({
      body: { component: 'acme-button', engine: 'happy-dom', as: 'outline' },
      diagnostics: [
        { code: 'FUD0540', severity: 'error', message: 'key', file: 'src/components/acme-button/acme-button.fud' },
        { code: 'FUD1207', severity: 'error', message: 'the render did not run' },
      ],
      failed: true,
    });
  });

  describe('what threw: FUD1420', () => {
    const threw = (stack: string): RenderPieceResult => ({ kind: 'threw', error: { message: 'down', stack } });

    it('at the first frame of the project, with its position', async () => {
      const file = join(root, 'src/server/routes.ts');
      const answer = await renderTool(project, checks(), queue, input({ route: '/productos/1' }), runners({ piece: threw(`Error: down\n    at load (${file}:2:3)`) }).deps);
      const start = LOAD_SOURCE.indexOf('throw');
      expect(answer).toMatchObject({
        failed: true,
        diagnostics: [{ code: 'FUD1420', message: '/productos/1 threw while rendering: down', file, span: { start, end: start } }],
      });
    });

    it('with no frame in the project: the piece, or for a URL no route answers, the routes folder', async () => {
      const component = await renderTool(project, checks(), queue, input({ component: 'acme-card' }), runners({ piece: threw('Error: down') }).deps);
      expect(component.diagnostics?.[0]).toMatchObject({ code: 'FUD1420', file: at('src/components/acme-card/acme-card.fud') });
      expect(component.diagnostics?.[0]).not.toHaveProperty('span');

      const nowhere = await renderTool(project, checks(), queue, input({ route: '/nada/aqui' }), runners({ piece: threw('Error: down') }).deps);
      expect(nowhere.diagnostics?.[0]).toMatchObject({ code: 'FUD1420', message: '/nada/aqui threw while rendering: down', file: join(root, 'src', 'routes') });
    });
  });

  it('a URL no route answers runs in the folder with routes, or the first one when none has', async () => {
    const other = join(root, 'other');
    const first = runners();
    await renderTool(project, checks([], [other, root]), queue, input({ route: '/nada/aqui' }), first.deps);
    expect(first.asked.roots).toEqual([root]);
    const none = runners();
    await renderTool(project, checks([], [other, join(root, 'more')]), queue, input({ route: '/nada/aqui' }), none.deps);
    expect(none.asked.roots).toEqual([other]);
  });
});

describe('with the browser', () => {
  it('a route: FUD1207, it is seen with happy-dom or fudic_preview', async () => {
    const { deps, asked } = runners();
    const answer = await renderTool(project, checks(), queue, input({ route: '/', engine: 'browser' }), deps);
    expect(answer).toMatchObject({ failed: true, diagnostics: [{ code: 'FUD1207', message: expect.stringContaining('fudic_preview') }] });
    expect(asked.browser).toEqual([]);
  });

  it('without @fudic/workbench in the project: FUD1207 saying what to install', async () => {
    const answer = await renderTool(project, checks(), queue, input({ component: 'acme-button', engine: 'browser' }), runners({ none: true }).deps);
    expect(answer.diagnostics?.[0]).toMatchObject({ code: 'FUD1207', message: expect.stringContaining('pnpm add -D @fudic/workbench') });
  });

  it('a component: its file, case, props and select go to the bench; the outline comes back, and no view', async () => {
    const { deps, asked } = runners();
    const answer = await renderTool(
      project,
      checks(),
      queue,
      input({ component: 'acme-button', engine: 'browser', fixture: 'disabled', props: { label: 'x' }, select: 'button' }),
      deps,
    );
    expect(asked.browser).toEqual([{ component: at('src/components/acme-button/acme-button.fud'), case: 'disabled', props: { label: 'x' }, select: 'button' }]);
    expect(answer).toEqual({
      body: { component: 'acme-button', fixture: 'disabled', engine: 'browser', as: 'outline', outline: '- button "Save"', calls: [] },
      next: null,
    });

    const bare = runners();
    await renderTool(project, checks(), queue, input({ component: 'acme-card', engine: 'browser' }), bare.deps);
    expect(bare.asked.browser).toEqual([{ component: at('src/components/acme-card/acme-card.fud') }]);
  });

  it('what the browser drew: its HTML when asked, and its shot kept on disk, the last one per component', async () => {
    const shot = (png: string, fixture?: string) =>
      renderTool(
        project,
        checks(),
        queue,
        input({ component: 'acme-button', engine: 'browser', as: 'html', ...(fixture !== undefined ? { fixture } : {}) }),
        runners({ browser: { kind: 'rendered', outline: '- button "Save"', html: '<button>Save</button>', png: Buffer.from(png), errors: [] } }).deps,
      );
    const first = await shot('P1', 'disabled');
    expect(first.body).toEqual({ component: 'acme-button', fixture: 'disabled', engine: 'browser', as: 'html', html: '<button>Save</button>', calls: [] });
    const firstPath = (first.meta?.[VIEW_META_KEY] as { kind: string; png: string });
    expect(firstPath).toEqual({ kind: 'shot', png: expect.stringMatching(/^\.fudic\/renders\/acme-button\/disabled-[0-9a-f]{12}\.png$/u) });
    expect(readFileSync(join(root, firstPath.png), 'utf8')).toBe('P1');

    // With no case, named props; and the one before is gone: a URL of it never shows this one.
    const second = await shot('P2');
    const secondPath = (second.meta?.[VIEW_META_KEY] as { png: string }).png;
    expect(secondPath).toMatch(/^\.fudic\/renders\/acme-button\/props-[0-9a-f]{12}\.png$/u);
    expect(readdirSync(join(root, '.fudic/renders/acme-button'))).toEqual([secondPath.split('/').at(-1)]);
  });

  it('every way the bench does not answer an outline', async () => {
    const browser = async (result: BrowserRender) =>
      renderTool(project, checks(), queue, input({ component: 'acme-button', engine: 'browser', fixture: 'big' }), runners({ browser: result }).deps);

    const failure = await browser({ diagnostic: { code: 'FUD0960', severity: 'error', message: 'no browser' } } as unknown as BrowserRender);
    expect(failure).toMatchObject({ failed: true, diagnostics: [{ code: 'FUD0960', message: 'no browser' }] });

    const noCase = await browser({ kind: 'no-case', cases: ['primary'] });
    expect(noCase.diagnostics?.[0]).toMatchObject({ code: 'FUD1421', message: expect.stringContaining('its cases are: primary') });

    const notJson = await browser({ kind: 'not-json', prop: 'onPick' });
    expect(notJson.diagnostics?.[0]).toMatchObject({ code: 'FUD1428', message: expect.stringContaining('the prop onPick is not JSON') });

    const threw = await browser({ kind: 'threw', message: 'the page answered 500' });
    expect(threw.diagnostics?.[0]).toMatchObject({
      code: 'FUD1420',
      message: 'acme-button threw while rendering: the page answered 500',
      file: at('src/components/acme-button/acme-button.fud'),
    });
  });
});

describe('the runs go through the queue', () => {
  it('one render waits for the run before it', async () => {
    const order: string[] = [];
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const busy = queue.run(async () => {
      order.push('test:start');
      await held;
      order.push('test:end');
    });
    const deps = {
      runners: async () =>
        ({
          renderPiece: async () => {
            order.push('render');
            return RENDERED;
          },
        }) as unknown as Runners,
    };
    const render = renderTool(project, checks(), queue, input({ component: 'acme-card' }), deps);
    await new Promise((r) => setTimeout(r, 20));
    expect(order).toEqual(['test:start']);
    release();
    await Promise.all([busy, render]);
    expect(order).toEqual(['test:start', 'test:end', 'render']);
  });
});

describe('loadRunners', () => {
  it('renderPiece from @fudic/testing/run and renderInBrowser from @fudic/workbench, when they export them', async () => {
    const pkgs = tempDir();
    try {
      for (const [name, exports] of [
        ['testing', { './run': { import: './run.js' } }],
        ['workbench', { '.': { import: './index.js' } }],
      ] as const) {
        mkdirSync(join(pkgs.root, 'node_modules/@fudic', name), { recursive: true });
        writeFileSync(join(pkgs.root, 'node_modules/@fudic', name, 'package.json'), JSON.stringify({ name: `@fudic/${name}`, exports }));
      }
      const renderPiece = (): void => undefined;
      const renderInBrowser = (): void => undefined;
      const runners = await loadRunners(pkgs.root, async (url) => (url.endsWith('run.js') ? { renderPiece } : { renderInBrowser }));
      expect(runners).toEqual({ renderPiece, renderInBrowser });
    } finally {
      pkgs.dispose();
    }
  });
});
