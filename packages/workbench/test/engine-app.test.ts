/**
 * SDD-82 §4.2–§4.5 in the engine, without a browser: a page's or a flow's criterion begun on the
 * bench with its cookie, `as` with a page of its own per person, the quiet page before each
 * `then` and after each `when`, the retries of a positive `then`, and the calls in the result.
 * The same against Chrome and the app's Vite: test/browser/app.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { createBench, type Bench } from '@fudic/vite';
import { VIEWPORT, type BrowserLike } from '../src/browser.js';
import { BENCH_COOKIE, MAIN, runCriterion, stepProblem, type LoadedTerm, type TermLoader } from '../src/engine.js';
import type { LoadedExtension, TermHost } from '../src/extension.js';
import type { PlannedCriterion, PlannedStep } from '../src/pages.js';
import { Unsettled } from '../src/quiet.js';
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

/** The ctx of these tests: the page each person drives, by its host. */
const HOST: LoadedExtension = { file: 'C:/fake/host.js', extension: { context: (_ctx, host: TermHost) => ({ host }) } };

type Run = (ctx: { host: TermHost }, args: Readonly<Record<string, unknown>>) => Promise<{ pass: boolean; evidence: unknown }>;

function terms(table: Record<string, Run | { run: Run; negative: LoadedTerm['negative'] }>): TermLoader {
  return async (_block, name): Promise<LoadedTerm> => {
    const entry = table[name]!;
    const run = typeof entry === 'function' ? entry : entry.run;
    const negative = typeof entry === 'function' ? undefined : entry.negative;
    return {
      path: `C:/terms/${name}.js`,
      layer: 'workspace',
      params: [{ name: 'n', type: 'number' }],
      ...(negative !== undefined ? { negative } : {}),
      run: (ctx, args) => run(ctx as { host: TermHost }, args),
    };
  };
}

function appCriterion(bench: Bench, steps: Omit<PlannedStep, 'offset'>[], over: Partial<PlannedCriterion> = {}): PlannedCriterion {
  return {
    id: 'alta',
    route: '/usuarios',
    mount: 'body',
    offset: 0,
    spec: 'C:/p/src/flows/alta.fudspec',
    fixture: null,
    steps: steps.map((s) => ({ ...s, offset: 0 })),
    app: { origin: APP_ORIGIN, bench, run: 'r', setup: { answers: { save: 1 } }, names: { services: 'dos' } },
    ...over,
  };
}

const ok: Run = async () => ({ pass: true, evidence: 'ok' });

describe('a criterion of the app', () => {
  it('is begun on the bench with its cookie, opens the app origin, and its calls go in the result', async () => {
    const bench = createBench();
    const browser = browserOf();
    let id = '';
    const result = await runCriterion(
      browser,
      'http://127.0.0.1:1',
      appCriterion(bench, [{ block: 'then', term: 'ok', args: [] }]),
      terms({
        ok: async ({ host }) => {
          // What the server would log while the page runs.
          id = [...browser.pages[0]!.calls].find((c) => c.startsWith('cookie '))!.split(' ')[1]!.split('=')[1]!;
          expect(bench.names(id)).toEqual({ services: 'dos' });
          bench.called(id, { id: 'routes/u', name: 'save', args: {}, faked: true, status: 200 });
          bench.called(id, { id: 'routes/u', name: 'csv', args: {}, faked: true, status: 500, mismatch: true });
          expect(host.page).toBeDefined();
          return { pass: true, evidence: null };
        },
      }),
      [HOST],
    );
    const calls = browser.pages[0]!.calls;
    expect(calls).toContain(`goto ${APP_ORIGIN}/usuarios`);
    expect(calls.find((c) => c.startsWith('cookie '))).toMatch(new RegExp(`^cookie ${BENCH_COOKIE}=r-\\d+\\.alta ${APP_ORIGIN.replace(/\./gu, '\\.')}$`, 'u'));
    expect(result.verdict).toBe('pass');
    expect(result.calls).toEqual([
      { id: 'routes/u', name: 'save', args: {}, faked: true, status: 200 },
      { id: 'routes/u', name: 'csv', args: {}, faked: true, status: 500, mismatch: true },
    ]);
    // A wrong kind of answer is FUD1514, of the `.fudspec`.
    expect(result.diagnostics).toMatchObject([{ code: 'FUD1514', file: 'C:/p/src/flows/alta.fudspec' }]);
    // And ended: the bench forgets it.
    expect(bench.names(id)).toBeUndefined();
  });

  it('answers its own error status: only no answer at all stops it', async () => {
    const bench = createBench();
    const failing = await runCriterion(browserOf(() => fakePage(undefined, { status: 503 })), '', appCriterion(bench, []), terms({}), [HOST]);
    expect(failing.verdict).toBe('pass');
    const nothing = await runCriterion(browserOf(() => fakePage(undefined, { status: null })), '', appCriterion(bench, []), terms({}), [HOST]);
    expect(nothing).toMatchObject({ verdict: 'error', calls: [] });
  });

  it('a criterion planned in error still says its calls: none', async () => {
    const result = await runCriterion(browserOf(), '', appCriterion(createBench(), [], { error: 'no' }), terms({}), [HOST]);
    expect(result).toMatchObject({ verdict: 'error', calls: [] });
  });
});

describe('as (SDD-82 §3.7)', () => {
  it('another person gets a page of its own, opened where the criterion starts; as main comes back', async () => {
    const browser = browserOf();
    const seen: unknown[] = [];
    const who: Run = async ({ host }) => {
      seen.push(host.page);
      return { pass: true, evidence: null };
    };
    const result = await runCriterion(
      browser,
      '',
      appCriterion(createBench(), [
        { block: 'when', term: 'who', args: [] },
        { block: 'when', term: 'as', args: ['luis'] },
        { block: 'then', term: 'who', args: [] },
        { block: 'then', term: 'as', args: [MAIN] },
        { block: 'then', term: 'who', args: [] },
        { block: 'then', term: 'as', args: ['luis'] },
      ]),
      terms({ who }),
      [HOST],
    );
    expect(result.verdict).toBe('pass');
    expect(browser.pages).toHaveLength(2);
    expect(browser.pages[1]!.calls.filter((c) => c.startsWith('goto'))).toEqual([`goto ${APP_ORIGIN}/usuarios`]);
    expect(browser.pages.every((p) => p.closed)).toBe(true);
    expect(result.steps.filter((s) => s.term === 'as')).toEqual([
      { block: 'when', term: 'as', layer: 'framework', args: ['luis'], pass: true, evidence: 'as luis' },
      { block: 'then', term: 'as', layer: 'framework', args: ['main'], pass: true, evidence: 'as main' },
      { block: 'then', term: 'as', layer: 'framework', args: ['luis'], pass: true, evidence: 'as luis' },
    ]);
  });

  it('a cancel closes every person’s page', async () => {
    const browser = browserOf();
    const abort = new AbortController();
    const stop: Run = async () => {
      abort.abort();
      return { pass: true, evidence: null };
    };
    await runCriterion(
      browser,
      '',
      appCriterion(createBench(), [
        { block: 'when', term: 'as', args: ['luis'] },
        { block: 'when', term: 'stop', args: [] },
      ]),
      terms({ stop }),
      [HOST],
      abort.signal,
    );
    expect(browser.pages.map((p) => p.closed)).toEqual([true, true]);
  });

  it('a person named after the cancel has its page closed at once', async () => {
    const browser = browserOf();
    const abort = new AbortController();
    const stop: Run = async () => {
      abort.abort();
      return { pass: true, evidence: null };
    };
    await runCriterion(
      browser,
      '',
      appCriterion(createBench(), [
        { block: 'when', term: 'stop', args: [] },
        { block: 'when', term: 'as', args: ['luis'] },
      ]),
      terms({ stop }),
      [HOST],
      abort.signal,
    );
    expect(browser.pages.map((p) => p.closed)).toEqual([true, true]);
  });

  it('a page opened after the cancel is closed at once', async () => {
    const abort = new AbortController();
    abort.abort();
    const browser = browserOf();
    await runCriterion(browser, '', appCriterion(createBench(), []), terms({}), [HOST], abort.signal);
    expect(browser.pages[0]!.closed).toBe(true);
  });
});

describe('the quiet page and the retries (SDD-82 §4.5)', () => {
  it('a positive then is tried again until it holds', async () => {
    let tries = 0;
    const late: Run = async () => ({ pass: ++tries >= 3, evidence: tries });
    const result = await runCriterion(browserOf(), '', appCriterion(createBench(), [{ block: 'then', term: 'late', args: [] }]), terms({ late }), [HOST]);
    expect([result.verdict, tries]).toEqual(['pass', 3]);
  });

  it('a negative then is read once, by its meta or by a function of its arguments', async () => {
    let tries = 0;
    const red: Run = async () => ({ pass: false, evidence: ++tries });
    const once = await runCriterion(
      browserOf(),
      '',
      appCriterion(createBench(), [
        { block: 'then', term: 'flat', args: ['0'] },
        { block: 'then', term: 'byArgs', args: ['0'] },
      ]),
      terms({ flat: { run: red, negative: true }, byArgs: { run: red, negative: (args) => args['n'] === 0 } }),
      [HOST],
    );
    expect([once.verdict, tries]).toEqual(['fail', 2]);
  });

  it('a positive then that never holds fails once the time is up', async () => {
    let tries = 0;
    const red: Run = async () => ({ pass: false, evidence: ++tries });
    const result = await runCriterion(
      browserOf(),
      '',
      appCriterion(createBench(), [{ block: 'then', term: 'red', args: ['1'] }]),
      terms({ red: { run: red, negative: (args) => args['n'] === 0 } }),
      [HOST],
    );
    expect(result.verdict).toBe('fail');
    expect(tries).toBeGreaterThan(10);
  }, 10_000);

  it('a page that does not settle is FUD1508, with what was pending', async () => {
    const result = await runCriterion(
      browserOf(() => fakePage(undefined, { pending: () => ['GET /hang'] })),
      '',
      appCriterion(createBench(), [{ block: 'when', term: 'ok', args: [] }]),
      terms({ ok }),
      [HOST],
    );
    expect(result.verdict).toBe('error');
    expect(result.diagnostics[0]).toMatchObject({ code: 'FUD1508' });
    expect(result.diagnostics[0]!.message).toContain('GET /hang');
  }, 10_000);

  it('a request the bench holds for ever is not waited for', async () => {
    const bench = createBench();
    const page = fakePage(undefined, { pending: () => ['GET /never'] });
    const result = await runCriterion(
      browserOf(() => page),
      '',
      appCriterion(
        bench,
        [
          { block: 'when', term: 'search', args: [] },
          { block: 'then', term: 'ok', args: [] },
        ],
        { app: { origin: APP_ORIGIN, bench, run: 'r', setup: { answers: { search: { $later: 'never' } } }, names: {} } },
      ),
      terms({
        // What the server does when the page asks: the bench hands out an answer that never arrives.
        search: async () => {
          const id = page.calls.find((c) => c.startsWith('cookie '))!.split(' ')[1]!.split('=')[1]!;
          bench.answer(id, 'search', {});
          return { pass: true, evidence: null };
        },
        ok,
      }),
      [HOST],
    );
    expect(result.verdict).toBe('pass');
  });

  it('a document that goes away under a look is a navigation pending; any other error of the look goes up', async () => {
    let looks = 0;
    const navigating = (): FakePage => {
      const page = fakePage();
      const evaluate = page.evaluate.bind(page);
      return Object.assign(page, {
        async evaluate<R>(script: string): Promise<R> {
          if (script.includes('__fudicBenchQuiet') && looks++ === 0) throw new Error('page.evaluate: Execution context was destroyed, most likely because of a navigation');
          return evaluate<R>(script);
        },
      });
    };
    const settles = await runCriterion(browserOf(navigating), '', appCriterion(createBench(), [{ block: 'then', term: 'ok', args: [] }]), terms({ ok }), [HOST]);
    expect(settles.verdict).toBe('pass');
    expect(looks).toBeGreaterThan(1);

    const broken = (): FakePage => {
      const page = fakePage();
      return Object.assign(page, {
        async evaluate<R>(): Promise<R> {
          throw new Error('Target page, context or browser has been closed');
        },
      });
    };
    const result = await runCriterion(browserOf(broken), '', appCriterion(createBench(), [{ block: 'then', term: 'ok', args: [] }]), terms({ ok }), [HOST]);
    expect(result).toMatchObject({ verdict: 'error', steps: [{ error: 'Target page, context or browser has been closed' }] });
  });
});

describe('stepProblem', () => {
  it('a page that did not settle is FUD1508 on its step', () => {
    const problem = stepProblem(new Unsettled(5000, ['GET /a', 'a frame']), { block: 'then', term: 'x', args: [], offset: 7 }, 'C:/s.fudspec');
    expect(problem).toMatchObject({ code: 'FUD1508', file: 'C:/s.fudspec', span: { start: 7, end: 7 } });
  });
});
