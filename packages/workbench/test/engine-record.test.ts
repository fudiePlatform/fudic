/**
 * SDD-82 §3.7 and §4.6 in the engine, without a browser: `given` runs before anything is opened
 * and then every person named so far opens the criterion's URL; and the host gives the terms what
 * the bench knows of the criterion — where it opens, its files, its clocks in every browser and in
 * the server, its calls, the last document, what the last `when` block did, and the real `paths()`.
 */

import { describe, expect, it } from 'vitest';
import { createBench, type Bench } from '@fudic/vite';
import { VIEWPORT, type BrowserLike } from '../src/browser.js';
import { runCriterion, type LoadedTerm, type TermLoader } from '../src/engine.js';
import type { LoadedExtension, TermHost } from '../src/extension.js';
import type { PlannedCriterion, PlannedStep } from '../src/pages.js';
import { fakePage, type FakePage } from './helpers/fake-page.js';

const APP_ORIGIN = 'http://127.0.0.1:2';

/** A browser that opens a fresh fake page each time, all of them kept. */
function browserOf(make: () => FakePage = () => fakePage()): BrowserLike & { pages: FakePage[] } {
  const pages: FakePage[] = [];
  return {
    name: 'chrome',
    viewport: VIEWPORT,
    pages,
    async newPage() {
      const page = make();
      pages.push(page);
      return page;
    },
    close: async () => undefined,
  };
}

/** The ctx of these tests: the host itself. */
const HOST: LoadedExtension = { file: 'C:/fake/host.js', extension: { context: (_ctx, host: TermHost) => ({ host }) } };

type Run = (host: TermHost, args: readonly unknown[]) => Promise<unknown>;

/** Terms by name, each one a function of the host; what it returns is its evidence. */
function terms(table: Record<string, Run>): TermLoader {
  return async (_block, name): Promise<LoadedTerm> => ({
    path: `C:/terms/${name}.js`,
    layer: 'workspace',
    params: [{ name: 'a', type: 'string' }],
    run: async (ctx, args) => ({ pass: true, evidence: await table[name]!((ctx as { host: TermHost }).host, Object.values(args)) }),
  });
}

function criterion(steps: Omit<PlannedStep, 'offset'>[], app: Bench | null, over: Partial<PlannedCriterion> = {}): PlannedCriterion {
  return {
    id: 'alta',
    route: '/usuarios',
    mount: 'body',
    offset: 0,
    spec: 'C:/p/src/routes/usuarios.fudspec',
    fixture: null,
    steps: steps.map((s) => ({ ...s, offset: 0 })),
    ...(app !== null ? { app: { origin: APP_ORIGIN, bench: app, run: 'r', setup: {}, names: {}, paths: async () => ['hola'] } } : {}),
    ...over,
  };
}

/** What each step said, in order. */
const said = (result: { steps: readonly unknown[] }) => result.steps.map((s) => (s as { evidence?: unknown }).evidence);

describe('given, before anything opens (SDD-82 §3.7)', () => {
  it('runs on pages not yet opened; then every person named so far opens the URL, main first', async () => {
    const browser = browserOf();
    const log: string[] = [];
    const result = await runCriterion(
      browser,
      'http://127.0.0.1:1',
      criterion(
        [
          { block: 'given', term: 'note', args: ['main'] },
          { block: 'given', term: 'as', args: ['luis'] },
          { block: 'given', term: 'note', args: ['luis'] },
          { block: 'then', term: 'note', args: ['then'] },
        ],
        createBench(),
      ),
      terms({
        note: async (_host, [what]) => {
          log.push(`${String(what)}: ${browser.pages.map((p) => p.calls.filter((c) => c.startsWith('goto')).length).join(',')}`);
          return what;
        },
      }),
      [HOST],
    );
    expect(result.verdict).toBe('pass');
    // Nothing was open while `given` ran; both were once it was over, and `then` ran as luis.
    expect(log).toEqual(['main: 0', 'luis: 0,0', 'then: 1,1']);
    expect(browser.pages.map((p) => p.calls.filter((c) => c.startsWith('goto')))).toEqual([[`goto ${APP_ORIGIN}/usuarios`], [`goto ${APP_ORIGIN}/usuarios`]]);
  });

  it('a given that errs stops the criterion before it opens', async () => {
    const browser = browserOf();
    const result = await runCriterion(
      browser,
      'http://127.0.0.1:1',
      criterion([{ block: 'given', term: 'bad', args: [] }], createBench()),
      terms({ bad: () => Promise.reject(new Error('no such feature')) }),
      [HOST],
    );
    expect(result).toMatchObject({ verdict: 'error', diagnostics: [{ code: 'FUD1204' }] });
    expect(browser.pages[0]!.calls.some((c) => c.startsWith('goto'))).toBe(false);
  });
});

describe('what the host knows of the criterion', () => {
  it('where it opens, its files relative to the .fudspec, its calls, the last document and the real paths()', async () => {
    const bench = createBench();
    const browser = browserOf(() => fakePage(undefined, { document: { status: 201, headers: { a: 'b' } } }));
    const result = await runCriterion(
      browser,
      'http://127.0.0.1:1',
      criterion([{ block: 'then', term: 'all', args: [] }], bench),
      terms({
        all: async (host) => {
          await host.quiet();
          return {
            url: host.url,
            files: [host.resolve('./fixtures/a.png'), host.resolve('b.png'), host.resolve('C:/abs/c.png'), host.resolve('/abs/d.png')],
            calls: host.calls(),
            response: host.response(),
            paths: await host.paths(),
          };
        },
      }),
      [HOST],
    );
    expect(said(result)).toEqual([
      {
        url: `${APP_ORIGIN}/usuarios`,
        files: ['C:/p/src/routes/fixtures/a.png', 'C:/p/src/routes/b.png', 'C:/abs/c.png', '/abs/d.png'],
        calls: [],
        response: { status: 201, headers: { a: 'b' } },
        paths: ['hola'],
      },
    ]);
  });

  it('a component has no calls and no paths(): it opens its own page', async () => {
    const result = await runCriterion(
      browserOf(),
      'http://127.0.0.1:1',
      criterion([{ block: 'then', term: 'all', args: [] }], null, { route: '/ui-a/uno' }),
      terms({ all: async (host) => ({ url: host.url, calls: host.calls(), paths: await host.paths() }) }),
      [HOST],
    );
    expect(said(result)).toEqual([{ url: 'http://127.0.0.1:1/ui-a/uno', calls: [], paths: null }]);
  });

  it('a page without paths() says so', async () => {
    const bench = createBench();
    const planned = criterion([{ block: 'then', term: 'paths', args: [] }], bench);
    const result = await runCriterion(
      browserOf(),
      'http://127.0.0.1:1',
      { ...planned, app: { ...planned.app!, paths: async () => null } },
      terms({ paths: (host) => host.paths() }),
      [HOST],
    );
    expect(said(result)).toEqual([null]);
  });
});

describe('the clocks (SDD-82 §4.6)', () => {
  it('clock stands every browser and the server at the instant; wait moves them all; one who comes later starts where it stands', async () => {
    const bench = createBench();
    const browser = browserOf();
    const result = await runCriterion(
      browser,
      'http://127.0.0.1:1',
      criterion(
        [
          { block: 'given', term: 'as', args: ['luis'] },
          { block: 'given', term: 'clock', args: [] },
          { block: 'given', term: 'as', args: ['main'] },
          { block: 'when', term: 'wait', args: [] },
          { block: 'when', term: 'as', args: ['marta'] },
          { block: 'then', term: 'who', args: [] },
        ],
        bench,
      ),
      terms({
        clock: (host) => host.clock(1000, '1970-01-01T00:00:01Z'),
        wait: (host) => host.advance(500),
        who: async (host) => browser.pages.findIndex((p) => p.page === host.page),
      }),
      [HOST],
    );
    expect(result.verdict).toBe('pass');
    const clocks = browser.pages.map((p) => p.calls.filter((c) => c.startsWith('clock')));
    expect(clocks).toEqual([
      ['clock install -59000', 'clock pause 1000', 'clock runFor 500'],
      ['clock install -59000', 'clock pause 1000', 'clock runFor 500'],
      // Marta came after `wait`: she starts where the server's clock stands.
      ['clock install -58500', 'clock pause 1500'],
    ]);
    // Under a clock each one opens once the document answers: it may wait on that clock.
    expect(browser.pages.map((p) => p.calls.find((c) => c.startsWith('goto')))).toEqual(Array(3).fill(`goto ${APP_ORIGIN}/usuarios (commit)`));
    // The last `then` ran as marta, on the third page.
    expect(said(result).at(-1)).toBe(2);
  });

  it('the server learns the clock and its name, and moves with wait', async () => {
    const bench = createBench();
    const seen: unknown[] = [];
    const planned = criterion(
      [
        { block: 'given', term: 'clock', args: [] },
        { block: 'when', term: 'wait', args: [] },
        { block: 'then', term: 'look', args: [] },
      ],
      bench,
    );
    let criterionId = '';
    const original = bench.begin.bind(bench);
    bench.begin = (id, setup, names) => {
      criterionId = id;
      original(id, setup, names);
    };
    await runCriterion(
      browserOf(),
      'http://127.0.0.1:1',
      planned,
      terms({
        clock: (host) => host.clock(2000, 'dos'),
        wait: (host) => host.advance(250),
        look: async () => void seen.push(bench.now(criterionId), bench.names(criterionId)),
      }),
      [HOST],
    );
    expect(seen).toEqual([2250, { clock: 'dos' }]);
  });

  it('a component has no server: its browsers alone stand at the clock', async () => {
    const browser = browserOf();
    const result = await runCriterion(
      browser,
      'http://127.0.0.1:1',
      criterion(
        [
          { block: 'given', term: 'clock', args: [] },
          { block: 'when', term: 'wait', args: [] },
          { block: 'when', term: 'as', args: ['luis'] },
        ],
        null,
      ),
      terms({ clock: (host) => host.clock(3000, 'tres'), wait: (host) => host.advance(10) }),
      [HOST],
    );
    expect(result.verdict).toBe('pass');
    expect(browser.pages.map((p) => p.calls.filter((c) => c.startsWith('clock')))).toEqual([['clock install -57000', 'clock pause 3000', 'clock runFor 10'], ['clock install -57000', 'clock pause 3000']]);
  });

  it('without clock, wait waits for real', async () => {
    const started = Date.now();
    await runCriterion(
      browserOf(),
      'http://127.0.0.1:1',
      criterion([{ block: 'when', term: 'wait', args: [] }], createBench()),
      terms({ wait: (host) => host.advance(60) }),
      [HOST],
    );
    expect(Date.now() - started).toBeGreaterThanOrEqual(55);
  });
});

describe('the last when block (SDD-82 §3.7)', () => {
  it('counts the requests and downloads since the block began, and knows whether the document is the same', async () => {
    let requests = 3;
    const downloads = ['old.csv'];
    const browser = browserOf(() => fakePage(undefined, { requests: () => requests, downloads: () => downloads }));
    const result = await runCriterion(
      browser,
      'http://127.0.0.1:1',
      criterion(
        [
          { block: 'when', term: 'act', args: [] },
          { block: 'when', term: 'act', args: [] },
          { block: 'then', term: 'look', args: [] },
          { block: 'when', term: 'navigate', args: [] },
          { block: 'then', term: 'look', args: [] },
        ],
        createBench(),
      ),
      terms({
        act: async () => {
          requests += 2;
          downloads.push('personas.csv');
          return null;
        },
        navigate: async () => {
          await browser.pages[0]!.goto(`${APP_ORIGIN}/otra`);
          requests += 1;
          return null;
        },
        look: async (host) => ({ ...host.lastWhen(), reloaded: await host.reloaded() }),
      }),
      [HOST],
    );
    expect(said(result).filter((e) => e !== null)).toEqual([
      // The first block: two acts, four requests, two files; the same document.
      { requests: 4, downloads: ['personas.csv', 'personas.csv'], reloaded: false },
      // The second: one request, no file; another document.
      { requests: 1, downloads: [], reloaded: true },
    ]);
  });

  it('a page that holds no document a token can be left on reads as reloaded', async () => {
    const result = await runCriterion(
      browserOf(() => fakePage(undefined, { tokens: false })),
      'http://127.0.0.1:1',
      criterion(
        [
          { block: 'when', term: 'act', args: [] },
          { block: 'then', term: 'look', args: [] },
        ],
        createBench(),
      ),
      terms({ act: async () => null, look: (host) => host.reloaded() }),
      [HOST],
    );
    expect(said(result)).toEqual([null, true]);
  });

  it('a person who first appears in a when block counts from before it opened', async () => {
    let requests = 0;
    const browser = browserOf(() => fakePage(undefined, { requests: () => requests }));
    const result = await runCriterion(
      browser,
      'http://127.0.0.1:1',
      criterion(
        [
          { block: 'when', term: 'as', args: ['luis'] },
          { block: 'when', term: 'act', args: [] },
          { block: 'then', term: 'look', args: [] },
        ],
        createBench(),
      ),
      terms({
        act: async () => {
          requests += 1;
          return null;
        },
        look: async (host) => ({ requests: host.lastWhen().requests, reloaded: await host.reloaded() }),
      }),
      [HOST],
    );
    expect(said(result).at(-1)).toEqual({ requests: 1, reloaded: true });
    expect(browser.pages[1]!.calls.filter((c) => c === 'mark' || c.startsWith('goto'))).toEqual(['mark', `goto ${APP_ORIGIN}/usuarios`]);
  });
});

describe('a then under a navigation (SDD-82 §4.5)', () => {
  it('a document that goes away under it is read again once the page is quiet; the second time it counts', async () => {
    let tries = 0;
    const navigating = () => Promise.reject(new Error('locator.evaluate: Execution context was destroyed, most likely because of a navigation'));
    const result = await runCriterion(
      browserOf(),
      'http://127.0.0.1:1',
      criterion(
        [
          { block: 'then', term: 'reloads-once', args: [] },
          { block: 'then', term: 'reloads-always', args: [] },
        ],
        createBench(),
      ),
      terms({
        'reloads-once': async () => (++tries === 1 ? navigating() : 'read'),
        'reloads-always': navigating,
      }),
      [HOST],
    );
    expect(said(result)[0]).toBe('read');
    expect(result).toMatchObject({ verdict: 'error', diagnostics: [{ code: 'FUD1204' }] });
  });
});
