/**
 * SDD-78, the bench's side of `fudic_render { engine: "browser" }` and of `fudic_look`: a case's
 * page with its props as literals, every case painted in one start of the project, and one
 * component rendered with a case and props on top. Without a browser: the project, the outline
 * and the fixture's execution are stand-ins; test/browser/paint.test.ts paints in Chrome.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FUD0971, FUD0973 } from '@fudic/diagnostics';
import type { BenchTarget } from '../src/target.js';
import { slashes } from '../src/target.js';
import { fakeBrowser, fakePage, type FakeElement, type FakePage } from './helpers/fake-page.js';
import { PROJECT } from './helpers/bench.js';

const state = vi.hoisted(() => ({
  page: undefined as FakePage | undefined,
  dir: '',
  failure: undefined as { diagnostic: unknown } | undefined,
  started: [] as unknown[],
  closed: 0,
  outlines: [] as string[],
  executed: undefined as { fixtures: Map<string, unknown>; diagnostics: unknown[] } | undefined,
}));

vi.mock('../src/project.js', () => ({
  startProject: async (input: unknown) => {
    state.started.push(input);
    if (state.failure !== undefined) return state.failure;
    return {
      // One fake page for every case: each case opens it anew, as a fresh page would be.
      browser: {
        ...fakeBrowser(state.page!),
        newPage: async () => {
          state.page!.closed = false;
          return state.page!;
        },
      },
      server: { origin: 'http://127.0.0.1:9' },
      dir: state.dir,
      close: async () => {
        state.closed += 1;
      },
    };
  },
}));

vi.mock('../src/outline.js', () => ({
  outlineOf: async (_page: unknown, selector: string) => {
    state.outlines.push(selector);
    return `- outline of ${selector}`;
  },
}));

vi.mock('../src/execute-fixtures.js', () => ({
  executeFixtures: async () => state.executed!,
}));

const { casePage, casesOf, paintCases, renderInBrowser } = await import('../src/paint.js');

const TARGET: BenchTarget = {
  tag: 'app-card',
  component: '/p/src/components/app-card.fud',
  spec: null,
  fixture: '/p/src/components/app-card.fixture.ts',
  projectRoot: '/p',
};

/** A real component of the fixture project, with a fixture beside it, and one without. */
const BUMP = `${PROJECT}/src/components/app-bump.fud`;
const BUMP_FIXTURE = `${PROJECT}/src/components/app-bump.fixture.ts`;
const SLOTTED = `${PROJECT}/src/components/app-slotted.fud`;

beforeEach(() => {
  state.dir = slashes(mkdtempSync(join(tmpdir(), 'fudic-paint-')));
  state.page = fakePage();
  state.failure = undefined;
  state.started = [];
  state.closed = 0;
  state.outlines = [];
  state.executed = { fixtures: new Map(), diagnostics: [] };
});

afterEach(() => {
  rmSync(state.dir, { recursive: true, force: true });
});

describe('casePage: one case, its props as literals of the page', () => {
  it('each prop a const of its @code, passed as a property, $content as children', () => {
    const page = casePage(TARGET, 'case-0', { label: 'Save', count: 2, tags: ['a'], $content: '<b>x</b>' });
    expect(page).toEqual({ source: expect.any(String) });
    const { source } = page as { source: string };
    expect(source).toContain('<link rel="component" href="/p/src/components/app-card.fud">');
    expect(source).toContain('    @code {\n      const label = "Save";\n      const count = 2;\n      const tags = ["a"];\n    }\n');
    expect(source).toContain('<app-card .label=@label .count=@count .tags=@tags><b>x</b></app-card>');
    expect(source).toContain('<title>app-card · case-0</title>');
  });

  it('no props: no @code, the bare tag', () => {
    const { source } = casePage(TARGET, 'case-1', {}) as { source: string };
    expect(source).not.toContain('@code');
    expect(source).toContain('<app-card></app-card>');
  });

  it('a value that does not come back the same from JSON names its prop', () => {
    expect(casePage(TARGET, 'case-0', { label: 'ok', onClick: () => undefined })).toEqual({ notJson: 'onClick' });
    expect(casePage(TARGET, 'case-0', { when: new Date(0) })).toEqual({ notJson: 'when' });
  });
});

describe('paintCases: every case on its page, in one start of the project', () => {
  it('pages for the JSON cases, the others named; one start, one close', async () => {
    const painted = await paintCases({
      target: TARGET,
      cases: [
        { name: 'primary', values: { label: 'Save' } },
        { name: 'fn', values: { onClick: () => undefined } },
        { name: 'empty', values: {} },
      ],
      shoot: false,
    });
    expect(painted).toEqual([
      { name: 'primary', outline: '- outline of body > app-card', errors: [] },
      { name: 'fn', notJson: 'onClick' },
      { name: 'empty', outline: '- outline of body > app-card', errors: [] },
    ]);
    expect(state.started).toEqual([{ root: '/p', targets: [TARGET], options: {} }]);
    expect(state.closed).toBe(1);
    // Two pages written, numbered by their place among the cases: the one with no JSON has none.
    expect(existsSync(`${state.dir}/routes/app-card/case-0.fud`)).toBe(true);
    expect(existsSync(`${state.dir}/routes/app-card/case-1.fud`)).toBe(false);
    expect(readFileSync(`${state.dir}/routes/app-card/case-2.fud`, 'utf8')).toContain('<app-card></app-card>');
    expect(existsSync(`${state.dir}/routes/app-card.fud`)).toBe(true);
    expect(state.page!.calls.filter((c) => c.startsWith('goto'))).toEqual([
      'goto http://127.0.0.1:9/app-card/case-0',
      'goto http://127.0.0.1:9/app-card/case-2',
    ]);
    expect(state.page!.calls.filter((c) => c === 'close')).toHaveLength(2);
    // Not asked to photograph: no screenshot.
    expect(state.page!.calls.some((c) => c.startsWith('screenshot'))).toBe(false);
  });

  it('select narrows the outline inside the host; the browser chosen reaches the project', async () => {
    await paintCases({ target: TARGET, cases: [{ name: 'a', values: {} }], select: 'button', shoot: false, browser: 'chrome' });
    expect(state.outlines).toEqual(['body > app-card >> button']);
    expect(state.started).toEqual([{ root: '/p', targets: [TARGET], options: { browser: 'chrome' } }]);
  });

  it('shoot: a png of the host, with the errors the page threw', async () => {
    state.page = fakePage(() => ({ png: Buffer.from('PNG') }));
    const page = state.page;
    const original = page.goto.bind(page);
    page.goto = async (url) => {
      const status = await original(url);
      page.fail('Boom\n    at x.js:1:1');
      return status;
    };
    const painted = await paintCases({ target: TARGET, cases: [{ name: 'a', values: {} }], shoot: true });
    expect(painted).toEqual([{ name: 'a', outline: '- outline of body > app-card', png: Buffer.from('PNG'), errors: ['Boom'] }]);
    expect(state.page.calls).toContain('screenshot body > app-card');
  });

  it.each([
    ['no box', null],
    ['no width', { width: 0, height: 10 }],
    ['no height', { width: 10, height: 0 }],
  ] as const)('shoot, a host with %s: no png', async (_name, box) => {
    state.page = fakePage(() => ({ box } as FakeElement));
    const painted = await paintCases({ target: TARGET, cases: [{ name: 'a', values: {} }], shoot: true });
    expect(painted).toEqual([{ name: 'a', outline: '- outline of body > app-card', errors: [] }]);
    expect(state.page.calls.some((c) => c.startsWith('screenshot'))).toBe(false);
  });

  it.each([
    [500, 'the page answered 500'],
    [404, 'the page answered 404'],
    [null, 'the page answered nothing'],
  ] as const)('a page that answers %s is an error, and the page is closed', async (status, error) => {
    state.page = fakePage(undefined, { status });
    const painted = await paintCases({ target: TARGET, cases: [{ name: 'a', values: {} }], shoot: true });
    expect(painted).toEqual([{ name: 'a', error }]);
    expect(state.page.calls).toContain('close');
    expect(state.outlines).toEqual([]);
  });

  it('a project that does not start is its failure', async () => {
    state.failure = { diagnostic: FUD0971({ file: 'x.fud' }) };
    expect(await paintCases({ target: TARGET, cases: [{ name: 'a', values: {} }], shoot: false })).toBe(state.failure);
    expect(state.closed).toBe(0);
  });
});

describe('casesOf: the fixture, executed', () => {
  it('no fixture: no cases, nothing executed', async () => {
    state.executed = undefined;
    expect(await casesOf({ ...TARGET, fixture: null })).toEqual({ cases: {} });
  });

  it('the cases of its default export', async () => {
    const cases = { primary: { label: 'Save' } };
    state.executed = { fixtures: new Map([[TARGET.fixture!, cases]]), diagnostics: [] };
    expect(await casesOf(TARGET)).toEqual({ cases });
  });

  it('a fixture that throws is its diagnostic', async () => {
    const diagnostic = FUD0973({ file: TARGET.fixture!, reason: 'boom' });
    state.executed = { fixtures: new Map(), diagnostics: [diagnostic] };
    expect(await casesOf(TARGET)).toEqual({ diagnostic });
  });
});

describe('renderInBrowser: one component, a case and props on top', () => {
  it('a file that is not a component is the failure of resolving it', async () => {
    const result = await renderInBrowser({ component: `${PROJECT}/fudic.json` });
    expect(result).toEqual({ diagnostic: expect.objectContaining({ code: 'FUD0970' }) });
    expect(state.started).toEqual([]);
  });

  it('a fixture that throws: threw, with its message', async () => {
    state.executed = { fixtures: new Map(), diagnostics: [FUD0973({ file: BUMP_FIXTURE, reason: 'boom' })] };
    const result = await renderInBrowser({ component: BUMP, case: 'diez' });
    expect(result).toEqual({ kind: 'threw', message: expect.stringContaining('boom') });
  });

  it('a case the fixture has not: no-case, with the ones it has', async () => {
    state.executed = { fixtures: new Map([[BUMP_FIXTURE, { diez: { value: 10 }, uno: { value: 1 } }]]), diagnostics: [] };
    expect(await renderInBrowser({ component: BUMP, case: 'cien' })).toEqual({ kind: 'no-case', cases: ['diez', 'uno'] });
    expect(state.started).toEqual([]);
  });

  it('the case with the props on top, under the case name; select and browser passed on', async () => {
    state.executed = { fixtures: new Map([[BUMP_FIXTURE, { diez: { value: 10, label: 'a' } }]]), diagnostics: [] };
    const result = await renderInBrowser({ component: BUMP, case: 'diez', props: { label: 'b' }, select: 'output', browser: 'chrome' });
    expect(result).toEqual({ kind: 'rendered', outline: '- outline of body > app-bump >> output', errors: [] });
    const page = readFileSync(`${state.dir}/routes/app-bump/case-0.fud`, 'utf8');
    expect(page).toContain('const value = 10;');
    expect(page).toContain('const label = "b";');
    expect(state.started).toEqual([expect.objectContaining({ options: { browser: 'chrome' } })]);
  });

  it('no case and no fixture: the props alone', async () => {
    const result = await renderInBrowser({ component: SLOTTED, props: { title: 'x' } });
    expect(result).toEqual({ kind: 'rendered', outline: '- outline of body > app-slotted', errors: [] });
    expect(readFileSync(`${state.dir}/routes/app-slotted/case-0.fud`, 'utf8')).toContain('const title = "x";');
  });

  it('no case and no props: the bare component', async () => {
    const result = await renderInBrowser({ component: SLOTTED });
    expect(result).toEqual({ kind: 'rendered', outline: '- outline of body > app-slotted', errors: [] });
  });

  it('a prop that is not JSON: not-json, naming it', async () => {
    expect(await renderInBrowser({ component: SLOTTED, props: { onClick: () => undefined } as Record<string, unknown> })).toEqual({
      kind: 'not-json',
      prop: 'onClick',
    });
  });

  it('a page that answers an error: threw, with what it answered', async () => {
    state.page = fakePage(undefined, { status: 500 });
    expect(await renderInBrowser({ component: SLOTTED })).toEqual({ kind: 'threw', message: 'the page answered 500' });
  });

  it('a project that does not start is its failure', async () => {
    state.failure = { diagnostic: FUD0971({ file: 'x.fud' }) };
    expect(await renderInBrowser({ component: SLOTTED })).toBe(state.failure);
  });
});
