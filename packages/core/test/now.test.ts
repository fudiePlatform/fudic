import { afterEach, describe, expect, it, vi } from 'vitest';
import { now } from '../src/index.js';

describe('now (SDD-61 §3.12)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is the current instant, a new Date on every call', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T10:00:00.000Z'));
    const first = now();
    expect(first).toBeInstanceOf(Date);
    expect(first.toISOString()).toBe('2026-10-26T10:00:00.000Z');
    vi.setSystemTime(new Date('2026-10-26T10:00:01.000Z'));
    expect(now().toISOString()).toBe('2026-10-26T10:00:01.000Z');
    expect(first.toISOString()).toBe('2026-10-26T10:00:00.000Z');
  });
});
