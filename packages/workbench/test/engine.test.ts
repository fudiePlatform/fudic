import { describe, expect, it } from 'vitest';
import { namedArgs, runCriterion, type LoadedTerm, type TermLoader } from '../src/engine.js';
import type { BenchExtension, LoadedExtension, TermHost } from '../src/extension.js';
import type { PlannedCriterion, PlannedStep } from '../src/pages.js';
import { missingRuntime } from '../src/runtime.js';
import { fakeBrowser, fakeLocator, fakePage, type FakePage } from './helpers/fake-page.js';

const ORIGIN = 'http://127.0.0.1:1';

/** The mounted element, as the engine locates it to photograph it. */
const MOUNT = 'body > app-card';
const SHOT = `screenshot ${MOUNT}`;

/** A criterion of these steps; where they are written does not matter to the engine. */
function criterion(steps: Omit<PlannedStep, 'offset'>[], extra: { error?: string } = {}): PlannedCriterion {
  return { id: 'c', route: '/c', mount: MOUNT, offset: 0, fixture: null, steps: steps.map((s) => ({ ...s, offset: 0 })), ...extra };
}

/** The ctx of these tests: one fake extension hands the terms the host itself. */
interface HostCtx {
  readonly host: TermHost;
}

type Run = (ctx: HostCtx, args: Readonly<Record<string, unknown>>) => Promise<{ pass: boolean; evidence: unknown }>;

/** Terms by name: each answers what the test says; an unknown name fails to load. */
function terms(table: Record<string, Run>): TermLoader {
  return async (_block, name) => {
    const run = table[name];
    if (run === undefined) throw new Error(`no term "${name}"\nsecond line`);
    const term: LoadedTerm = {
      path: `C:/terms/${name}.js`,
      layer: 'framework',
      params: [
        { name: 'target', type: 'element' },
        { name: 'n', type: 'number' },
      ],
      run: (ctx, args) => run(ctx as HostCtx, args),
    };
    return term;
  };
}

/** An extension loaded from `file`. */
function loaded(file: string, extension: BenchExtension): LoadedExtension {
  return { file, extension };
}

/** The fake runtime: no ctx of its own, only the host. */
const HOST: LoadedExtension = loaded('C:/fake/host.js', { context: (_ctx, host): HostCtx => ({ host }) });

const ok: Run = async () => ({ pass: true, evidence: 'ok' });
const no: Run = async () => ({ pass: false, evidence: 'no' });

async function run(page: FakePage, c: PlannedCriterion, loader: TermLoader, extensions: readonly LoadedExtension[] = [HOST]) {
  const browser = fakeBrowser(page);
  const result = await runCriterion(browser, ORIGIN, c, loader, extensions);
  return { result, browser };
}

describe('namedArgs', () => {
  it('names the arguments after the params, a number param as a number', () => {
    expect(
      namedArgs(
        [
          { name: 'target', type: 'element' },
          { name: 'px', type: 'number' },
          { name: 'text', type: 'string' },
        ],
        ['app-card', '44', 'x'],
      ),
    ).toEqual({ target: 'app-card', px: 44, text: 'x' });
  });
});

describe('runCriterion, on a page without a browser — criterion 12', () => {
  it('opens a page, silences every WebSocket but the bench, observes, goes, and closes', async () => {
    const page = fakePage();
    const { result } = await run(page, criterion([{ block: 'then', term: 'a', args: ['x', '1'] }]), terms({ a: ok }));
    expect(page.calls).toEqual(['silence /@vite/client /', 'addInitScript', `goto ${ORIGIN}/c`, SHOT, 'close']);
    expect(result).toMatchObject({
      id: 'c',
      verdict: 'pass',
      steps: [{ block: 'then', term: 'a', layer: 'framework', args: ['x', '1'], pass: true, evidence: 'ok' }],
      pageErrors: [],
    });
    expect(result.ms).toBeGreaterThanOrEqual(0);
    expect('error' in result).toBe(false);
  });

  it('passes the arguments by name to run', async () => {
    let seen: unknown;
    await run(
      fakePage(),
      criterion([{ block: 'then', term: 'a', args: ['app-card', '44'] }]),
      terms({
        a: async (_ctx, args) => {
          seen = args;
          return { pass: true, evidence: null };
        },
      }),
    );
    expect(seen).toEqual({ target: 'app-card', n: 44 });
  });

  it('a red then does not cut the following thens', async () => {
    const { result } = await run(
      fakePage(),
      criterion([
        { block: 'then', term: 'no', args: [] },
        { block: 'then', term: 'ok', args: [] },
        { block: 'then', term: 'no', args: [] },
      ]),
      terms({ ok, no }),
    );
    expect(result.verdict).toBe('fail');
    expect(result.steps.map((s) => ('pass' in s ? s.pass : s.error))).toEqual([false, true, false]);
  });

  it('a given or a when answering pass: false does not fail the criterion', async () => {
    const { result } = await run(
      fakePage(),
      criterion([
        { block: 'given', term: 'no', args: [] },
        { block: 'when', term: 'no', args: [] },
      ]),
      terms({ no }),
    );
    expect(result.verdict).toBe('pass');
  });

  it('a step that throws cuts the criterion in error, with its first line, even after a red then', async () => {
    const page = fakePage();
    const { result } = await run(
      page,
      criterion([
        { block: 'then', term: 'no', args: [] },
        { block: 'then', term: 'boom', args: [] },
        { block: 'then', term: 'ok', args: [] },
      ]),
      terms({
        ok,
        no,
        boom: async () => {
          throw new Error('app-card matches 2 elements\n  at stack');
        },
      }),
    );
    expect(result.verdict).toBe('error');
    expect(result.steps).toEqual([
      { block: 'then', term: 'no', layer: 'framework', args: [], pass: false, evidence: 'no' },
      { block: 'then', term: 'boom', layer: 'framework', args: [], error: 'app-card matches 2 elements' },
    ]);
    expect(page.closed).toBe(true);
  });

  it('a term that cannot be loaded is a step in error from the workspace layer', async () => {
    const { result } = await run(fakePage(), criterion([{ block: 'when', term: 'missing', args: ['a'] }]), terms({}));
    expect(result.verdict).toBe('error');
    expect(result.steps).toEqual([
      { block: 'when', term: 'missing', layer: 'workspace', args: ['a'], error: 'no term "missing"' },
    ]);
  });

  it('a pageerror during a step cuts the criterion in error after that step', async () => {
    const page = fakePage();
    const { result } = await run(
      page,
      criterion([
        { block: 'when', term: 'breaks', args: [] },
        { block: 'then', term: 'ok', args: [] },
      ]),
      terms({
        ok,
        breaks: async () => {
          page.fail('TypeError: x is undefined');
          return { pass: true, evidence: 'clicked' };
        },
      }),
    );
    expect(result).toMatchObject({ verdict: 'error', pageErrors: ['TypeError: x is undefined'] });
    expect(result.steps.map((s) => s.term)).toEqual(['breaks']);
  });

  it('a pageerror while loading fails a criterion without steps', async () => {
    const page = fakePage();
    const loading: FakePage = {
      ...page,
      async goto(url) {
        page.fail('ReferenceError: boot');
        return page.goto(url);
      },
    };
    const { result } = await run(loading, criterion([]), terms({}));
    expect(result).toMatchObject({ verdict: 'error', steps: [], pageErrors: ['ReferenceError: boot'] });
  });

  it('a page that answers an error status ends in error without steps', async () => {
    const { result } = await run(
      fakePage(undefined, { status: 500 }),
      criterion([{ block: 'then', term: 'ok', args: [] }]),
      terms({ ok }),
    );
    expect(result).toMatchObject({ verdict: 'error', steps: [], error: 'the page /c answered 500' });
  });

  it('a page that answers nothing ends in error', async () => {
    const { result } = await run(fakePage(undefined, { status: null }), criterion([]), terms({}));
    expect(result).toMatchObject({ verdict: 'error', error: 'the page /c answered nothing' });
  });

  it('a navigation that throws ends in error and still closes the page', async () => {
    const page = fakePage(undefined, {
      goto: () => Promise.reject(new Error('net::ERR_CONNECTION_REFUSED at http://127.0.0.1:1/c\nCall log:')),
    });
    const { result } = await run(page, criterion([]), terms({}));
    expect(result).toMatchObject({ verdict: 'error', error: 'net::ERR_CONNECTION_REFUSED at http://127.0.0.1:1/c' });
    expect(page.closed).toBe(true);
  });

  it('a criterion planned in error ends in error without opening a page', async () => {
    const { result, browser } = await run(
      fakePage(),
      criterion([{ block: 'then', term: 'ok', args: [] }], { error: 'no entry' }),
      terms({ ok }),
    );
    expect(result).toMatchObject({ id: 'c', verdict: 'error', steps: [], pageErrors: [], error: 'no entry' });
    expect(browser.opened).toBe(0);
  });
});

describe('runCriterion — SDD-59 §6.3, the workbench is extended from outside', () => {
  it('runs every setup in order, with the Playwright page, before it mounts', async () => {
    const page = fakePage();
    const given: unknown[] = [];
    const setup = (name: string) => async (p: unknown) => {
      given.push(p);
      page.calls.push(`setup ${name}`);
    };
    await run(page, criterion([]), terms({}), [
      loaded('C:/a.js', { setup: setup('a') }),
      loaded('C:/b.js', { setup: setup('b') }),
    ]);
    expect(page.calls).toEqual(['silence /@vite/client /', 'addInitScript', 'setup a', 'setup b', `goto ${ORIGIN}/c`, SHOT, 'close']);
    expect(given).toHaveLength(2);
    expect(given[0]).toBe(page.page);
    expect(given[1]).toBe(page.page);
  });

  it('chains the contexts in order, from an empty one: each receives what the one before left', async () => {
    const received: unknown[] = [];
    let seen: unknown;
    await run(
      fakePage(),
      criterion([{ block: 'then', term: 'a', args: [] }]),
      terms({
        a: async (ctx) => {
          seen = ctx;
          return { pass: true, evidence: null };
        },
      }),
      [
        loaded('C:/first.js', {
          context: (ctx: object) => {
            received.push(ctx);
            return { ...ctx, first: 1 };
          },
        }),
        // Without a context: the ctx goes on untouched.
        loaded('C:/only-setup.js', { setup: async () => undefined }),
        loaded('C:/second.js', {
          context: (ctx: object) => {
            received.push(ctx);
            return { ...ctx, second: 2 };
          },
        }),
      ],
    );
    expect(received).toEqual([{}, { first: 1 }]);
    expect(seen).toEqual({ first: 1, second: 2 });
  });

  it('builds the ctx once per criterion, and every step shares it', async () => {
    let built = 0;
    const ctxs: unknown[] = [];
    const keep: Run = async (ctx) => {
      ctxs.push(ctx);
      return { pass: true, evidence: null };
    };
    await run(
      fakePage(),
      criterion([
        { block: 'when', term: 'keep', args: [] },
        { block: 'then', term: 'keep', args: [] },
      ]),
      terms({ keep }),
      [loaded('C:/count.js', { context: () => ({ built: (built += 1) }) })],
    );
    expect(built).toBe(1);
    expect(ctxs[0]).toBe(ctxs[1]);
  });

  it('without extensions the terms receive an empty ctx', async () => {
    let seen: unknown;
    await run(
      fakePage(),
      criterion([{ block: 'then', term: 'a', args: [] }]),
      terms({
        a: async (ctx) => {
          seen = ctx;
          return { pass: true, evidence: null };
        },
      }),
      [],
    );
    expect(seen).toEqual({});
  });

  it('a setup that throws is the criterion in error, naming the file; it does not mount and closes the page', async () => {
    const page = fakePage();
    let second = false;
    const { result } = await run(page, criterion([{ block: 'then', term: 'ok', args: [] }]), terms({ ok }), [
      loaded('C:/proj/fudic/bench.js', {
        setup: async () => {
          throw new Error('no route\n  at stack');
        },
      }),
      loaded('C:/after.js', {
        setup: async () => {
          second = true;
        },
      }),
    ]);
    expect(result).toMatchObject({ verdict: 'error', steps: [], error: 'C:/proj/fudic/bench.js: no route' });
    expect(second).toBe(false);
    expect(page.calls.some((c) => c.startsWith('goto'))).toBe(false);
    expect(page.closed).toBe(true);
  });

  it('a context that throws is the criterion in error, naming the file; no step runs', async () => {
    let ran = false;
    const { result } = await run(
      fakePage(),
      criterion([{ block: 'then', term: 'a', args: [] }]),
      terms({
        a: async () => {
          ran = true;
          return { pass: true, evidence: null };
        },
      }),
      [
        loaded('C:/proj/fudic/bench.js', {
          context: () => {
            throw new TypeError('ctx.nope is not a function');
          },
        }),
      ],
    );
    expect(result).toMatchObject({ verdict: 'error', steps: [], error: 'C:/proj/fudic/bench.js: ctx.nope is not a function' });
    expect(ran).toBe(false);
  });

  it('something thrown that is not an Error is said as it is', async () => {
    const { result } = await run(fakePage(), criterion([]), terms({}), [
      loaded('C:/odd.js', { setup: () => Promise.reject('just a string') }),
    ]);
    expect(result).toMatchObject({ verdict: 'error', error: 'C:/odd.js: just a string' });
  });
});

describe('runCriterion — the host the extensions receive', () => {
  it('its page is the Playwright page under the one the workbench drives', async () => {
    const page = fakePage();
    let host: TermHost | undefined;
    await run(
      page,
      criterion([{ block: 'then', term: 'a', args: [] }]),
      terms({
        a: async (ctx) => {
          host = ctx.host;
          return { pass: true, evidence: null };
        },
      }),
    );
    expect(host!.page).toBe(page.page);
  });

  /** A `when` that settles a gesture on `target` and keeps what the gesture returned. */
  function settling(results: unknown[], calls: string[]): Run {
    return async ({ host }, { target }) => {
      const answer = await host.settle(fakeLocator(String(target)), async () => {
        calls.push('gesture');
        return 42;
      });
      results.push(answer);
      return { pass: true, evidence: null };
    };
  }

  /** The calls from adopting the gesture's element to the frame after it. */
  const during = (calls: readonly string[]) => calls.slice(calls.indexOf('adopt app-card'), calls.indexOf('frame') + 1);

  it('settle adopts the locator, runs the gesture, waits for the host to hydrate and a frame, and returns what the gesture did', async () => {
    const page = fakePage(() => ({ host: { id: '3', defined: false } }));
    const results: unknown[] = [];
    await run(page, criterion([{ block: 'when', term: 'act', args: ['app-card'] }]), terms({ act: settling(results, page.calls) }));
    expect(during(page.calls)).toEqual(['adopt app-card', 'gesture', 'waitFor 3', 'frame']);
    expect(results).toEqual([42]);
  });

  it('settle waits only a frame when the tag was already defined', async () => {
    const page = fakePage(() => ({ host: { id: '3', defined: true } }));
    await run(page, criterion([{ block: 'when', term: 'act', args: ['app-card'] }]), terms({ act: settling([], page.calls) }));
    expect(during(page.calls)).toEqual(['adopt app-card', 'gesture', 'frame']);
  });

  it('settle waits only a frame when nothing hydratable holds the element', async () => {
    const page = fakePage(() => ({ host: null }));
    await run(page, criterion([{ block: 'when', term: 'act', args: ['app-card'] }]), terms({ act: settling([], page.calls) }));
    expect(during(page.calls)).toEqual(['adopt app-card', 'gesture', 'frame']);
  });

  it('a gesture that rejects is the step in error', async () => {
    const { result } = await run(
      fakePage(() => ({ host: null })),
      criterion([{ block: 'when', term: 'act', args: ['app-card'] }]),
      terms({
        act: async ({ host }) => host.settle(fakeLocator('app-card'), () => Promise.reject(new Error('click timed out'))),
      }),
    );
    expect(result.steps).toEqual([{ block: 'when', term: 'act', layer: 'framework', args: ['app-card'], error: 'click timed out' }]);
  });
});

describe('runCriterion — criterion 8, shots and marks', () => {
  /** The mount at (100, 50). */
  const page = () =>
    fakePage((css) =>
      css === MOUNT ? { box: { x: 100, y: 50, width: 200, height: 40 }, png: Buffer.from('card') } : {},
    );
  /** Where each reference is, as the runtime reports it to the host. */
  const BOXES: Record<string, { x: number; y: number; width: number; height: number }> = {
    [MOUNT]: { x: 100, y: 50, width: 200, height: 40 },
    'app-card': { x: 100, y: 50, width: 200, height: 40 },
    'role:link': { x: 110, y: 60, width: 30, height: 10 },
  };
  const sees: Record<string, Run> = {
    sees: async ({ host }, { target }) => {
      host.onLocate(String(target), BOXES[String(target)]!);
      return { pass: true, evidence: 'seen' };
    },
  };

  it('with a when, photographs the mount before the first when and at the end', async () => {
    const p = page();
    const { result } = await run(
      p,
      criterion([
        { block: 'given', term: 'sees', args: ['app-card'] },
        { block: 'when', term: 'sees', args: ['role:link'] },
        { block: 'when', term: 'sees', args: ['role:link'] },
        { block: 'then', term: 'sees', args: ['app-card'] },
      ]),
      terms(sees),
    );
    expect(p.calls.filter((c) => c === SHOT)).toHaveLength(2);
    expect(result.shots).toEqual({
      before: { png: Buffer.from('card'), box: { x: 100, y: 50, width: 200, height: 40 } },
      after: { png: Buffer.from('card'), box: { x: 100, y: 50, width: 200, height: 40 } },
    });
  });

  it('leaves each located box relative to the after shot, on its step', async () => {
    const { result } = await run(
      page(),
      criterion([
        { block: 'when', term: 'sees', args: ['role:link'] },
        { block: 'then', term: 'sees', args: [MOUNT] },
      ]),
      terms(sees),
    );
    expect(result.marks).toEqual([
      { step: 0, ref: 'role:link', box: { x: 10, y: 10, width: 30, height: 10 } },
      { step: 1, ref: MOUNT, box: { x: 0, y: 0, width: 200, height: 40 } },
    ]);
  });

  it('keeps one mark per reference and step, the last, in its place; another step marks it again', async () => {
    const twice: Run = async ({ host }) => {
      host.onLocate('role:link', { x: 110, y: 60, width: 30, height: 10 });
      host.onLocate(MOUNT, { x: 100, y: 50, width: 200, height: 40 });
      host.onLocate('role:link', { x: 120, y: 70, width: 40, height: 20 });
      return { pass: true, evidence: null };
    };
    const { result } = await run(
      page(),
      criterion([
        { block: 'when', term: 'twice', args: [] },
        { block: 'then', term: 'sees', args: ['role:link'] },
      ]),
      terms({ ...sees, twice }),
    );
    expect(result.marks).toEqual([
      { step: 0, ref: 'role:link', box: { x: 20, y: 20, width: 40, height: 20 } },
      { step: 0, ref: MOUNT, box: { x: 0, y: 0, width: 200, height: 40 } },
      { step: 1, ref: 'role:link', box: { x: 10, y: 10, width: 30, height: 10 } },
    ]);
  });

  it('without a when, takes only the after shot', async () => {
    const { result } = await run(page(), criterion([{ block: 'then', term: 'sees', args: ['app-card'] }]), terms(sees));
    expect(Object.keys(result.shots)).toEqual(['after']);
  });

  it('photographs also a criterion that ended in error', async () => {
    const { result } = await run(
      page(),
      criterion([{ block: 'then', term: 'missing', args: [] }]),
      terms(sees),
    );
    expect(result.verdict).toBe('error');
    expect(result.shots.after).toBeDefined();
  });

  it.each([
    ['without a box', { box: null }],
    ['with a box of zero width', { box: { width: 0, height: 5 } }],
    ['with a box of zero height', { box: { width: 5, height: 0 } }],
    [
      'whose shot throws',
      {
        png: () => {
          throw new Error('Element is not attached');
        },
      },
    ],
  ])('a mount %s has no shot, no marks, and the verdict does not change', async (_name, element) => {
    const p = fakePage((css) => (css === MOUNT ? element : {}));
    const { result } = await run(
      p,
      criterion([
        { block: 'when', term: 'sees', args: ['role:link'] },
        { block: 'then', term: 'sees', args: ['role:link'] },
      ]),
      terms(sees),
    );
    expect(result).toMatchObject({ verdict: 'pass', shots: {}, marks: [] });
  });

  it('a page that did not load has no shots', async () => {
    const { result } = await run(fakePage(undefined, { status: 404 }), criterion([]), terms({}));
    expect(result).toMatchObject({ shots: {}, marks: [] });
  });
});

describe('runCriterion — criterion 10, cancel', () => {
  it('a cancel that arrives while the page is still opening stops it too, and no step runs', async () => {
    const page = fakePage();
    const controller = new AbortController();
    let ran = false;
    const browser = fakeBrowser(page);
    const opening = browser.newPage.bind(browser);
    // The cancel lands between asking for the page and having it: the race of a cancel right after `running`.
    browser.newPage = async () => {
      controller.abort();
      return opening();
    };
    await runCriterion(
      browser,
      ORIGIN,
      criterion([{ block: 'then', term: 'ok', args: [] }]),
      terms({
        ok: async () => {
          ran = true;
          return { pass: true, evidence: 'ok' };
        },
      }),
      [HOST],
      controller.signal,
    );
    expect(ran).toBe(false);
    expect(page.closed).toBe(true);
  });

  it('an abort closes the page under the run, and it ends', async () => {
    const page = fakePage();
    const controller = new AbortController();
    let release: () => void = () => undefined;
    const waiting = new Promise<void>((done) => (release = done));
    const pending = runCriterion(
      fakeBrowser(page),
      ORIGIN,
      criterion([{ block: 'then', term: 'slow', args: [] }]),
      terms({
        slow: async () => {
          await waiting;
          return { pass: true, evidence: 'late' };
        },
      }),
      [HOST],
      controller.signal,
    );
    await new Promise((done) => setTimeout(done, 0));
    controller.abort();
    expect(page.closed).toBe(true);
    release();
    await pending;
    // Once done, the signal no longer reaches the page.
    page.closed = false;
    controller.signal.dispatchEvent(new Event('abort'));
    expect(page.closed).toBe(false);
  });
});

describe('runCriterion — SDD-59 §4.2, without @fudic/terms', () => {
  it('a term that touches ctx is in error, saying the package is missing and how to add it', async () => {
    const { result } = await run(
      fakePage(),
      criterion([{ block: 'then', term: 'uses', args: ['app-card'] }]),
      terms({
        uses: async (ctx) => {
          (ctx as unknown as { locate(ref: string): unknown }).locate('app-card');
          return { pass: true, evidence: null };
        },
      }),
      [missingRuntime('C:/proj')],
    );
    expect(result.steps).toEqual([
      {
        block: 'then',
        term: 'uses',
        layer: 'framework',
        args: ['app-card'],
        error: '@fudic/terms is not installed in C:/proj: pnpm add -D @fudic/terms',
      },
    ]);
  });

  it('a term that does not touch ctx still runs', async () => {
    const { result } = await run(fakePage(), criterion([{ block: 'then', term: 'ok', args: [] }]), terms({ ok }), [missingRuntime('C:/proj')]);
    expect(result.verdict).toBe('pass');
  });
});
