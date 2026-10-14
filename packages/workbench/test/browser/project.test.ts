/**
 * Criteria 9, 10 and the second half of 15 against Chrome, on the test project's own
 * components; and the Playwright adapter itself, call by call.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BrowserLike } from '../../src/browser.js';
import { runCriterion } from '../../src/engine.js';
import { FLAT_TEXT } from '../../src/flat-text.js';
import { chrome, EXAMPLE_TERMS, PROJECT, startBench, target, termsFrom, type TestBench } from '../helpers/bench.js';

const terms = termsFrom(EXAMPLE_TERMS);
let browser: BrowserLike;

beforeAll(async () => {
  browser = await chrome();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

describe('app-slotted and app-frame', () => {
  let bench: TestBench;

  beforeAll(async () => {
    bench = await startBench(PROJECT);
  }, 60_000);

  afterAll(async () => {
    await bench?.close();
  });

  async function run(tag: string, spec: string) {
    const plan = bench.plan(target(PROJECT, tag, false), `component ${tag}\n\n${spec}`);
    const result = await runCriterion(browser, bench.origin, plan.criteria[0]!, terms);
    return result;
  }

  it('criterion 9 — a reference that matches two elements is an error of the step that says 2', async () => {
    const result = await run('app-slotted', 'criterion dos\n  then\n    visible role:link\n    visible app-slotted\n');
    expect(result.verdict).toBe('error');
    expect(result.steps).toEqual([
      {
        block: 'then',
        term: 'visible',
        layer: 'workspace',
        args: ['role:link'],
        error: expect.stringContaining('matches 2 elements') as unknown,
      },
    ]);
  }, 60_000);

  it('criterion 10 — the fallback of an empty slot counts, a <style> does not', async () => {
    const result = await run('app-slotted', 'criterion vacio\n  then\n    text app-slotted "Hello card fallback text One Featured"\n');
    expect(result).toMatchObject({ verdict: 'pass', steps: [{ evidence: 'Hello card fallback text One Featured' }] });
  }, 60_000);

  it('criterion 10 — the nodes assigned to a slot count, and replace its fallback', async () => {
    const result = await run(
      'app-frame',
      'criterion asignado\n  then\n    text app-frame "assigned words"\n    text app-slotted "assigned words"\n',
    );
    expect(result).toMatchObject({
      verdict: 'pass',
      steps: [
        { evidence: 'Hello card assigned words One Featured' },
        { evidence: 'Hello card assigned words One Featured' },
      ],
    });
  }, 60_000);
});

describe('criterion 15 — the signal the component writes is the host\'s, alive', () => {
  let bench: TestBench;

  beforeAll(async () => {
    bench = await startBench(PROJECT);
  }, 60_000);

  afterAll(async () => {
    await bench?.close();
  });

  it('click role:button, and then the text says 11', async () => {
    const bump = target(PROJECT, 'app-bump');
    const plan = bench.plan(
      bump,
      'component app-bump\n\ncriterion suma\n  given\n    props diez\n' +
        '  then\n    text app-bump "10"\n\n' +
        'criterion suma-uno\n  given\n    props diez\n  when\n    click role:button\n  then\n    text app-bump "11"\n',
      await bench.fixture(bump.fixture!),
    );
    expect(plan.files.has('components/bench-host-suma-uno.fud')).toBe(true);
    const [before, after] = await Promise.all(plan.criteria.map((c) => runCriterion(browser, bench.origin, c, terms)));
    expect(before).toMatchObject({ verdict: 'pass', steps: [{ evidence: 'more 10' }] });
    expect(after).toMatchObject({ verdict: 'pass', pageErrors: [] });
    expect(after!.steps.map((s) => ('evidence' in s ? s.evidence : s.error))).toEqual(['clicked role:button', 'more 11']);
  }, 60_000);
});

describe('the Playwright adapter', () => {
  it('answers null for a navigation with no response', async () => {
    const page = await browser.newPage();
    try {
      expect(await page.goto('about:blank')).toBeNull();
    } finally {
      await page.close();
    }
  }, 30_000);

  it('runs page scripts with their argument, waits for one, and reports page errors', async () => {
    const page = await browser.newPage();
    try {
      const errors: string[] = [];
      page.onPageError((message) => errors.push(message));
      await page.goto('about:blank');
      expect(await page.evaluate<number>('(arg) => arg * 2', 21)).toBe(42);
      await page.evaluate('() => { setTimeout(() => { globalThis.ready = true; throw new Error("late\\nmore"); }, 10); }');
      await page.waitFor('(arg) => globalThis.ready === arg', true);
      await expect.poll(() => errors).toEqual(['late']);
    } finally {
      await page.close();
    }
  }, 30_000);

  it('runs init scripts before the page, and reads the flattened text of an element', async () => {
    const page = await browser.newPage();
    try {
      await page.addInitScript('globalThis.early = "yes";');
      await page.goto('data:text/html,<p id="x">a <b>b</b><style>p{}</style><script>var c;</script>  c</p>');
      expect(await page.evaluate<string>('() => globalThis.early')).toBe('yes');
      expect(await page.locate({ css: '#x' }).evaluate<string>(FLAT_TEXT)).toBe('a b c');
      expect(await page.locate({ css: '#x' }).count()).toBe(1);
    } finally {
      await page.close();
    }
  }, 30_000);
});
