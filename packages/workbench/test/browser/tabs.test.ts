/**
 * Criteria 11 and 14, against Chrome: the first click is served before a `then` reads, and the
 * measuring page does not obey Vite's reloads.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BrowserLike, PageLike } from '../../src/browser.js';
import { runCriterion, type CriterionResult, type LoadedTerm, type TermLoader } from '../../src/engine.js';
import type { PlannedCriterion } from '../../src/pages.js';
import { chrome, EXAMPLE_TERMS, PROJECT, startBench, target, termsFrom, type TestBench } from '../helpers/bench.js';

const SPEC = `component app-tabs

criterion cambia-de-pestana
  when
    click role:tab/"Tab B"
  then
    text role:tabpanel "panel B"

criterion espera-y-cambia
  given
    pause 0
  when
    click role:tab/"Tab B"
  then
    text role:tabpanel "panel B"

criterion recarga-a-mitad
  when
    click role:tab/"Tab B"
    full-reload
  then
    text role:tabpanel "panel B"
`;

let bench: TestBench;
let browser: BrowserLike;
let criteria: readonly PlannedCriterion[];

beforeAll(async () => {
  bench = await startBench(PROJECT);
  browser = await chrome();
  criteria = bench.plan(target(PROJECT, 'app-tabs', false), SPEC).criteria;
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await bench?.close();
});

function byId(id: string): PlannedCriterion {
  return criteria.find((c) => c.id === id)!;
}

/** The example's terms, plus two of the test's own: a pause, and Vite reloading every page. */
function loader(pauseMs: number): TermLoader {
  const example = termsFrom(EXAMPLE_TERMS);
  return async (block, name): Promise<LoadedTerm> => {
    if (name === 'pause') {
      return {
        path: 'test/pause.js',
        layer: 'workspace',
        params: [],
        run: async () => {
          await new Promise((done) => setTimeout(done, pauseMs));
          return { pass: true, evidence: `${pauseMs} ms` };
        },
      };
    }
    if (name === 'full-reload') {
      return {
        path: 'test/full-reload.js',
        layer: 'workspace',
        params: [],
        run: async () => {
          bench.vite.environments.client.hot.send({ type: 'full-reload', path: '*' });
          // Long enough for a page that listens to reload and settle on its first state.
          await new Promise((done) => setTimeout(done, 1500));
          return { pass: true, evidence: 'sent' };
        },
      };
    }
    return example(block, name);
  };
}

/** The same browser, with one page call replaced: to show what the engine's own call prevents. */
function patched(override: (page: PageLike) => Partial<PageLike>): BrowserLike {
  return {
    name: browser.name,
    viewport: browser.viewport,
    async newPage() {
      const page = await browser.newPage();
      return { ...page, ...override(page) };
    },
    close: () => browser.close(),
  };
}

async function tenTimes(run: () => Promise<CriterionResult>): Promise<string[]> {
  const verdicts: string[] = [];
  for (let i = 0; i < 10; i += 1) verdicts.push((await run()).verdict);
  return verdicts;
}

describe('criterion 11 — the first click is served (bug A)', () => {
  // The component's hydration chunk, loaded by the first gesture. Holding it on the server makes
  // the race of bug A certain instead of a matter of milliseconds under load.
  const CHUNK = { match: /^\/@fudic\/h\/app-tabs\.js/u, ms: 800 };

  it('is red without the wait for the gesture', async () => {
    // The action returns as soon as the click does: no wait for `fud:hydrated`, no frame.
    const careless = patched(() => ({ waitFor: async () => undefined, evaluate: async <R>() => undefined as R }));
    bench.slow = CHUNK;
    try {
      const result = await runCriterion(careless, bench.origin, byId('cambia-de-pestana'), loader(0));
      expect(result.verdict).toBe('fail');
      expect(result.steps.at(-1)).toMatchObject({ term: 'text', pass: false, evidence: { actual: 'panel A' } });
    } finally {
      bench.slow = null;
    }
  }, 60_000);

  it('is green with the wait, however long the chunk takes', async () => {
    bench.slow = CHUNK;
    try {
      const result = await runCriterion(browser, bench.origin, byId('cambia-de-pestana'), loader(0));
      expect(result.verdict).toBe('pass');
    } finally {
      bench.slow = null;
    }
  }, 60_000);

  it('is green at the first try, ten times in a row', async () => {
    const verdicts = await tenTimes(() => runCriterion(browser, bench.origin, byId('cambia-de-pestana'), loader(0)));
    expect(verdicts).toEqual(Array(10).fill('pass'));
  }, 120_000);

  it.each([1000, 3000])('is green ten times with %i ms of wait before the click', async (ms) => {
    const verdicts = await tenTimes(() => runCriterion(browser, bench.origin, byId('espera-y-cambia'), loader(ms)));
    expect(verdicts).toEqual(Array(10).fill('pass'));
  }, 120_000);
});

describe('criterion 14 — the measuring page does not listen to Vite', () => {
  it('a full-reload in the middle of a criterion does not reload it', async () => {
    const result = await runCriterion(browser, bench.origin, byId('recarga-a-mitad'), loader(0));
    expect(result.verdict).toBe('pass');
  }, 60_000);

  it('and it would, if its WebSockets were not silenced', async () => {
    const listening = patched(() => ({ silenceWebSockets: async () => undefined }));
    const result = await runCriterion(listening, bench.origin, byId('recarga-a-mitad'), loader(0));
    expect(result.verdict).toBe('fail');
    expect(result.steps.at(-1)).toMatchObject({ term: 'text', pass: false, evidence: { actual: 'panel A' } });
  }, 60_000);
});
