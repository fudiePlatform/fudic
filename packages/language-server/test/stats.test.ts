/**
 * The counter criterion §6.14 is measured with.
 *
 * A criterion measured against a clock is not deterministic in CI, so cancellation is counted
 * instead: what must hold is that a cancelled request never reports as completed, and that the
 * work is not even started once the token is spent.
 */

import { describe, expect, it } from 'vitest';
import { RequestStats } from '../src/stats.js';
import { CANCELLED, TOKEN } from './_lsp.js';

describe('RequestStats', () => {
  it('starts at zero', () => {
    const stats = new RequestStats();

    expect([stats.completed, stats.cancelled]).toEqual([0, 0]);
  });

  it('runs the work and counts one completed', () => {
    const stats = new RequestStats();

    expect(stats.run(TOKEN, () => 'answer', undefined)).toBe('answer');
    expect([stats.completed, stats.cancelled]).toEqual([1, 0]);
  });

  it('does not even start work for a request already cancelled', () => {
    const stats = new RequestStats();
    let ran = false;

    const answer = stats.run(
      CANCELLED,
      () => {
        ran = true;
        return 'answer';
      },
      'empty',
    );

    expect(ran).toBe(false);
    expect(answer).toBe('empty');
    expect([stats.completed, stats.cancelled]).toEqual([0, 1]);
  });

  it('counts a request cancelled while it ran as cancelled, not completed', () => {
    const stats = new RequestStats();
    const token = { ...TOKEN, isCancellationRequested: false };

    const answer = stats.run(
      token,
      () => {
        token.isCancellationRequested = true; // the user typed again
        return 'stale';
      },
      'empty',
    );

    expect(answer).toBe('empty');
    expect([stats.completed, stats.cancelled]).toEqual([0, 1]);
  });

  it('leaves one completed per burst of N edits (§6.14)', () => {
    const stats = new RequestStats();
    const tokens = [CANCELLED, CANCELLED, CANCELLED, TOKEN];

    for (const token of tokens) stats.run(token, () => 'answer', undefined);

    expect([stats.completed, stats.cancelled]).toEqual([1, 3]);
  });

  it('starts over on reset: the counts are per session', () => {
    const stats = new RequestStats();
    stats.run(TOKEN, () => 1, 0);
    stats.reset();

    expect([stats.completed, stats.cancelled]).toEqual([0, 0]);
  });
});
