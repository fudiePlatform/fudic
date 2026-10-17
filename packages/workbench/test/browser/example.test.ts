/**
 * Criteria 8, 9, 10 and the first half of 15, against Chrome, on the components of
 * `examples/basic` and with its terms imported as they are.
 */

import { signal } from '@fudic/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BrowserLike } from '../../src/browser.js';
import { runCriterion } from '../../src/engine.js';
import type { LoadedExtension } from '../../src/extension.js';
import { chrome, EXAMPLE, EXAMPLE_TERMS, exampleExtensions, startBench, target, termsFrom, type TestBench } from '../helpers/bench.js';

const terms = termsFrom(EXAMPLE_TERMS);
let browser: BrowserLike;
let extensions: readonly LoadedExtension[];

beforeAll(async () => {
  browser = await chrome();
  extensions = await exampleExtensions();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

describe('app-card of the example', () => {
  let bench: TestBench;

  beforeAll(async () => {
    bench = await startBench(EXAMPLE);
  }, 60_000);

  afterAll(async () => {
    await bench?.close();
  });

  async function run(spec: string) {
    const card = target(EXAMPLE, 'app-card');
    const plan = bench.plan(card, `component app-card\n\n${spec}`, await bench.fixture(card.fixture!));
    return Promise.all(plan.criteria.map((c) => runCriterion(browser, bench.origin, c, terms, extensions)));
  }

  it('criterion 8 — every term of examples/basic/fudic/terms runs unchanged', async () => {
    const [measure, act] = await run(
      'criterion medir\n  given\n    props destacada\n    route /blog\n' +
        '  when\n    set-attribute app-card variant "highlight"\n' +
        '  then\n    min-height app-card 1\n    visible app-card\n    text app-card "Featured"\n\n' +
        'criterion pulsar\n  given\n    props destacada\n  when\n    click role:link/"Featured"\n',
    );
    expect(measure).toMatchObject({ verdict: 'pass', pageErrors: [] });
    expect(measure!.steps.map((s) => [s.term, 'pass' in s && s.pass])).toEqual([
      ['route', true],
      ['set-attribute', true],
      ['min-height', true],
      ['visible', true],
      ['text', true],
    ]);
    // `variant` arrives as a property: the attribute set-attribute replaced was not there.
    expect(measure!.steps[1]).toMatchObject({ evidence: 'before: none' });
    expect(act).toMatchObject({ verdict: 'pass', steps: [{ term: 'click', pass: true }] });
  }, 60_000);

  it('criterion 9 — a tag, a role and a role with its name find their element', async () => {
    const [result] = await run(
      'criterion referencias\n  given\n    props destacada\n' +
        '  then\n    visible app-card\n    visible role:link\n    visible role:link/"Featured"\n    visible role:link/"Feat"\n',
    );
    expect(result!.steps.map((s) => ('pass' in s ? s.pass : s.error))).toEqual([true, true, true, false]);
  }, 60_000);

  it('criterion 10 — text crosses the shadow root', async () => {
    const [result] = await run('criterion titulo\n  given\n    props titulo-largo\n  then\n    text app-card "A title long enough"\n');
    expect(result).toMatchObject({ verdict: 'pass' });
    expect(result!.steps[0]).toMatchObject({
      evidence: {
        expected: 'A title long enough',
        actual: 'A title long enough that it has to wrap onto a second line inside the card',
      },
    });
  }, 60_000);
});

describe('criterion 15 — a Signal prop from the fixture, alive', () => {
  let bench: TestBench;

  beforeAll(async () => {
    bench = await startBench(EXAMPLE);
  }, 60_000);

  afterAll(async () => {
    await bench?.close();
  });

  it('signal-display paints the value and its double: 10 — 20', async () => {
    // The fixture executed: `signal(10)` from the real runtime. Signal props only, so the host
    // does not import the fixture file and the example needs none on disk.
    const plan = bench.plan(
      { ...target(EXAMPLE, 'signal-display'), fixture: `${EXAMPLE}/src/components/signal-display.fixture.ts` },
      'component signal-display\n\ncriterion diez\n  given\n    props diez\n  then\n    text signal-display "10 — y deriva de ella: 20"\n',
      { diez: { value: signal(10) } },
    );
    const result = await runCriterion(browser, bench.origin, plan.criteria[0]!, terms, extensions);
    expect(result).toMatchObject({ verdict: 'pass', pageErrors: [] });
  }, 60_000);
});
