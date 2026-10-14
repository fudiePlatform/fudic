import { describe, expect, it } from 'vitest';
import type { TermContext } from '../src/context.js';
import { namedArgs, runCriterion, type LoadedTerm, type TermLoader } from '../src/engine.js';
import type { PlannedCriterion, PlannedStep } from '../src/pages.js';
import { fakeBrowser, fakePage, type FakePage } from './helpers/fake-page.js';

const ORIGIN = 'http://127.0.0.1:1';

/** The mounted element, as the engine locates it to photograph it. */
const MOUNT = 'body > app-card';
const SHOT = `screenshot {"css":"${MOUNT}"}`;

function criterion(steps: PlannedStep[], extra: { error?: string } = {}): PlannedCriterion {
  return { id: 'c', route: '/c', mount: MOUNT, fixture: null, steps, ...extra };
}

type Run = (ctx: TermContext, args: Readonly<Record<string, unknown>>) => Promise<{ pass: boolean; evidence: unknown }>;

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
      run,
    };
    return term;
  };
}

const ok: Run = async () => ({ pass: true, evidence: 'ok' });
const no: Run = async () => ({ pass: false, evidence: 'no' });

async function run(page: FakePage, c: PlannedCriterion, loader: TermLoader) {
  const browser = fakeBrowser(page);
  const result = await runCriterion(browser, ORIGIN, c, loader);
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

describe('runCriterion — criterion 8, shots and marks', () => {
  /** The mount at (100, 50), a link inside it at (110, 60). */
  const page = () =>
    fakePage((target) =>
      'css' in target && target.css === MOUNT
        ? { box: { x: 100, y: 50, width: 200, height: 40 }, png: Buffer.from('card') }
        : { box: { x: 110, y: 60, width: 30, height: 10 } },
    );
  const sees: Record<string, (ctx: TermContext, args: Readonly<Record<string, unknown>>) => Promise<{ pass: boolean; evidence: unknown }>> = {
    sees: async (ctx, { target }) => ({ pass: await ctx.locate(String(target)).isVisible(), evidence: 'seen' }),
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
    const p = fakePage((target) => ('css' in target && target.css === MOUNT ? element : {}));
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

describe('runCriterion — criterion 9, goto', () => {
  it('does not navigate, and the step is ignored, without evidence', async () => {
    const page = fakePage();
    const { result } = await run(
      page,
      criterion([
        { block: 'given', term: 'route', args: ['/blog'] },
        { block: 'then', term: 'ok', args: [] },
      ]),
      terms({
        ok,
        route: async (ctx, { target }) => {
          await ctx.goto(String(target));
          return { pass: true, evidence: 'opened /blog' };
        },
      }),
    );
    expect(result.verdict).toBe('pass');
    expect(result.steps).toEqual([
      { block: 'given', term: 'route', layer: 'framework', args: ['/blog'], pass: true, evidence: null, ignored: true },
      { block: 'then', term: 'ok', layer: 'framework', args: [], pass: true, evidence: 'ok' },
    ]);
    expect(page.calls.filter((c) => c.startsWith('goto'))).toEqual([`goto ${ORIGIN}/c`]);
  });
});
