import { describe, expect, it } from 'vitest';
import type { CriterionResult } from '../src/engine.js';
import type { PlannedCriterion } from '../src/pages.js';
import type { Verdict } from '../src/protocol.js';
import { DEFAULT_WORKERS, runOrder, runPool } from '../src/runner.js';

function criterion(id: string): PlannedCriterion {
  return { id, route: `/t/${id}`, mount: 'body > t', fixture: null, steps: [] };
}

function result(id: string): CriterionResult {
  return { id, verdict: 'pass', ms: 0, steps: [], pageErrors: [], shots: {}, marks: [] };
}

const FOUR = ['a', 'b', 'c', 'd'].map(criterion);

/** Runs that end when the test says so, counting how many are open at once. */
function gate() {
  const open = new Map<string, () => void>();
  let most = 0;
  const started: string[] = [];
  return {
    started,
    get most() {
      return most;
    },
    open,
    run: (c: PlannedCriterion) =>
      new Promise<CriterionResult>((done) => {
        started.push(c.id);
        open.set(c.id, () => {
          open.delete(c.id);
          done(result(c.id));
        });
        most = Math.max(most, open.size);
      }),
    async finish(id: string) {
      open.get(id)!();
      await new Promise((done) => setTimeout(done, 0));
    },
  };
}

describe('runOrder — criterion 7', () => {
  it('runs the criteria that did not pass, or never ran, first, each group in .fudspec order', () => {
    const verdicts = new Map<string, Verdict>([
      ['a', 'pass'],
      ['b', 'fail'],
      ['c', 'pass'],
      ['d', 'error'],
    ]);
    const five = [...FOUR, criterion('e')];
    expect(runOrder(five, verdicts).map((c) => c.id)).toEqual(['b', 'd', 'e', 'a', 'c']);
    expect(runOrder(FOUR, new Map()).map((c) => c.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('runPool — criterion 7', () => {
  it('runs four by default', () => {
    expect(DEFAULT_WORKERS).toBe(4);
  });

  it('with two workers and four criteria, keeps at most two pages open, and hands over each as it ends', async () => {
    const g = gate();
    const done: string[] = [];
    const pool = runPool({ criteria: FOUR, workers: 2, signal: new AbortController().signal, run: g.run, done: (r) => done.push(r.id) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(g.started).toEqual(['a', 'b']);
    await g.finish('b');
    expect(done).toEqual(['b']);
    expect(g.started).toEqual(['a', 'b', 'c']);
    await g.finish('c');
    await g.finish('a');
    await g.finish('d');
    expect(await pool).toEqual([]);
    expect(done).toEqual(['b', 'c', 'a', 'd']);
    expect(g.most).toBe(2);
  });

  it('never opens more workers than criteria, nor fewer than one', async () => {
    const g = gate();
    const one = runPool({ criteria: [criterion('a')], workers: 4, signal: new AbortController().signal, run: g.run, done: () => undefined });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await g.finish('a');
    await one;
    const zero = runPool({ criteria: FOUR, workers: 0, signal: new AbortController().signal, run: g.run, done: () => undefined });
    for (const id of ['a', 'b', 'c', 'd']) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await g.finish(id);
    }
    await zero;
    expect(g.most).toBe(1);
    expect(await runPool({ criteria: [], workers: 4, signal: new AbortController().signal, run: g.run, done: () => undefined })).toEqual([]);
  });

  it('a cancel discards the running ones and starts nothing more: those are the unfinished', async () => {
    const g = gate();
    const controller = new AbortController();
    const done: string[] = [];
    const pool = runPool({ criteria: FOUR, workers: 2, signal: controller.signal, run: g.run, done: (r) => done.push(r.id) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await g.finish('a');
    controller.abort();
    await g.finish('b');
    await g.finish('c');
    expect((await pool).sort()).toEqual(['b', 'c', 'd']);
    expect(done).toEqual(['a']);
    expect(g.started).toEqual(['a', 'b', 'c']);
  });
});
