/**
 * SDD-82 §4.5: the quiet page, as a probe sees it — what is pending, said as the diagnostic says
 * it, and the wait for two quiet looks in a row or the time limit. The script itself runs in a
 * real page in test/browser/app.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { describePending, LOOK, QUIET, QUIET_CAP, SHORT_TIMER, Unsettled, waitQuiet, type Pending } from '../src/quiet.js';

const quiet: Pending = { requests: [], timers: 0, frames: 0 };

/** A probe that answers these looks in turn, the last one for ever. */
function probe(looks: readonly Pending[], held = 0) {
  let n = 0;
  return { look: async () => looks[Math.min(n++, looks.length - 1)]!, held: () => held, asked: () => n };
}

describe('describePending', () => {
  it('lists the requests, then the timers and the frames, one or many', () => {
    expect(describePending({ requests: ['GET /a'], timers: 1, frames: 1 }, 0)).toEqual(['GET /a', 'a timer', 'a frame']);
    expect(describePending({ requests: [], timers: 2, frames: 3 }, 0)).toEqual(['2 timers', '3 frames']);
    expect(describePending(quiet, 0)).toEqual([]);
  });

  it('a request the bench holds for ever is not waited for', () => {
    expect(describePending({ requests: ['GET /never'], timers: 0, frames: 0 }, 1)).toEqual([]);
    expect(describePending({ requests: ['GET /never', 'GET /a'], timers: 0, frames: 0 }, 1)).toEqual(['GET /never', 'GET /a']);
  });
});

describe('waitQuiet', () => {
  it('returns after two quiet looks in a row', async () => {
    const p = probe([{ requests: ['GET /a'], timers: 0, frames: 0 }, quiet, { ...quiet, frames: 1 }, quiet, quiet]);
    await waitQuiet(p, 5000);
    expect(p.asked()).toBe(5);
  });

  it('throws what was still pending once `ms` pass with nothing finishing', async () => {
    let now = 0;
    const p = probe([{ requests: ['GET /slow'], timers: 2, frames: 0 }]);
    const error = await waitQuiet(p, 100, () => (now += 60)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Unsettled);
    // Started at 60; looked at 120 and at 180, past 60 + 100.
    expect(error).toMatchObject({ name: 'Unsettled', ms: 120, pending: ['GET /slow', '2 timers'] });
    expect((error as Error).message).toBe('the page did not settle in 120 ms; still pending: GET /slow, 2 timers');
  });

  it('each request that finishes gives the page `ms` more: a cold dev server is slow, not stuck', async () => {
    let now = 0;
    // Modules arrive one by one, 60 ms apart, for far longer than 100 ms; then the page is quiet.
    const modules = Array.from({ length: 8 }, (_, i) => ({ requests: [`GET /@fs/m${i}.js`, `GET /@fs/m${i + 1}.js`], timers: 0, frames: 0 }));
    const p = probe([...modules, quiet, quiet]);
    await waitQuiet(p, 100, () => (now += 60));
    expect(p.asked()).toBe(10);
  });

  it('a request that never finishes is no progress, though others start beside it', async () => {
    let now = 0;
    const p = probe([
      { requests: ['GET /never'], timers: 0, frames: 0 },
      { requests: ['GET /never', 'GET /b'], timers: 0, frames: 0 },
      { requests: ['GET /never', 'GET /b', 'GET /c'], timers: 0, frames: 0 },
    ]);
    const error = await waitQuiet(p, 100, () => (now += 60)).catch((e: unknown) => e);
    expect(error).toMatchObject({ ms: 120, pending: ['GET /never', 'GET /b'] });
  });

  it('a page that keeps finishing and starting requests is called busy at `ms × QUIET_CAP`', async () => {
    let now = 0;
    let n = 0;
    const p = { look: async () => ({ requests: [`GET /poll?${n++}`], timers: 0, frames: 0 }), held: () => 0 };
    const error = await waitQuiet(p, 100, () => (now += 60)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Unsettled);
    expect((error as Unsettled).ms).toBeGreaterThanOrEqual(100 * QUIET_CAP);
    expect((error as Unsettled).ms).toBeLessThan(100 * QUIET_CAP + 60);
  });

  it('two requests to one URL are two: one finishing is progress', async () => {
    let now = 0;
    const p = probe([
      { requests: ['GET /a', 'GET /a'], timers: 0, frames: 0 },
      { requests: ['GET /a'], timers: 0, frames: 0 },
      { requests: ['GET /a'], timers: 0, frames: 0 },
      quiet,
      quiet,
    ]);
    // Without the progress at the second look, the third (at 180) would be past 60 + 100.
    await waitQuiet(p, 100, () => (now += 60));
    expect(p.asked()).toBe(5);
  });

  it('the default clock is the real one', async () => {
    await waitQuiet(probe([quiet]), 10);
  });
});

describe('the scripts', () => {
  it('count timers shorter than a second, and look one frame later', () => {
    expect(QUIET).toContain(`Number(ms) >= ${SHORT_TIMER}`);
    expect(LOOK).toContain('state.raf(');
  });
});
