/**
 * Criterion 25 of SDD-61: `now()` travels in `fud-state`. The server paints the instant `T` once;
 * the client that hydrates reads `T` from the slot of the signal and does not call `now()`, and
 * one that creates the instance from scratch does.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { mount } from '../../src/index.js';
import * as Reloj from './parts/c-reloj.fud';

/** What the pipe of the fixture paints for `iso`. */
const painted = (iso: string): string =>
  new Intl.DateTimeFormat('es', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso));

const time = (root: ParentNode): string => root.querySelector('time')!.textContent!;

describe('criterion 25: now() travels in fud-state', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('the client that hydrates reads T from fud-state, and does not call now()', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T10:00:00.000Z'));
    const t = await mount(Reloj);
    expect(time(t.root)).toBe(painted('2026-10-26T10:00:00.000Z'));
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    t.root.querySelector('button')!.click();
    await t.settled();
    expect(time(t.root)).toBe(painted('2026-10-26T10:00:01.000Z'));
  });

  test('an instance created from scratch calls it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-05-05T05:05:05.000Z'));
    const t = await mount(Reloj, { via: 'client' });
    expect(time(t.root)).toBe(painted('2027-05-05T05:05:05.000Z'));
  });
});
