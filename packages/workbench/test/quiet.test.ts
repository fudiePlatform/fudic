/**
 * SDD-82 §4.5: the quiet page, as a probe sees it — what is pending, said as the diagnostic says
 * it, and the wait for two quiet looks in a row or the time limit. The script itself runs in a
 * real page in test/browser/app.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { describePending, LOOK, QUIET, SHORT_TIMER, Unsettled, waitQuiet, type Pending } from '../src/quiet.js';

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

  it('throws what was still pending once the time is up', async () => {
    let now = 0;
    const p = probe([{ requests: ['GET /slow'], timers: 2, frames: 0 }]);
    const error = await waitQuiet(p, 100, () => (now += 60)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Unsettled);
    expect(error).toMatchObject({ name: 'Unsettled', ms: 100, pending: ['GET /slow', '2 timers'] });
    expect((error as Error).message).toBe('the page did not settle in 100 ms; still pending: GET /slow, 2 timers');
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
