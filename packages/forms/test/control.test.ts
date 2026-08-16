/**
 * SDD-33 §6.1–§6.3 — a control is a signal with interaction state around it.
 */

import { describe, expect, it, vi } from 'vitest';
import { effect } from '@fudic/core';
import { control } from '../src/control.js';

describe('control', () => {
  it('is read by calling it, and a tracked read re-runs the effect (§6.1)', () => {
    const title = control('a');
    expect(title()).toBe('a');

    title.set('b');
    expect(title()).toBe('b');

    const seen: string[] = [];
    const stop = effect(() => {
      seen.push(title());
    });
    expect(seen).toEqual(['b']);

    title.set('c');
    expect(seen).toEqual(['b', 'c']);

    stop();
    title.set('d');
    expect(seen).toEqual(['b', 'c']);
  });

  it('never holds undefined: null is the canonical empty (§6.2)', () => {
    const omitted = control();
    expect(omitted()).toBeNull();

    const explicit = control<string | null>(undefined);
    expect(explicit()).toBeNull();

    const named = control('a');
    named.set(undefined as unknown as string);
    expect(named()).toBeNull();
  });

  it('is dirty only when the value actually moves (§6.2)', () => {
    const flag = control(false);
    expect(flag.dirty()).toBe(false);

    flag.set(false);
    expect(flag.dirty()).toBe(false);

    flag.set(true);
    expect(flag.dirty()).toBe(true);

    // Back to the baseline: the value moved, so it is not dirty any more.
    flag.set(false);
    expect(flag.dirty()).toBe(false);
  });

  it('tracks errors, touched and dirty as reads (§6.1)', () => {
    const title = control('');
    const seen: (string | null)[] = [];
    const stop = effect(() => {
      const e = title.errors();
      seen.push(e === null ? null : 'error');
    });
    expect(seen).toEqual([null]);
    stop();

    expect(title.touched()).toBe(false);
    expect(title.errors()).toBeNull();
  });

  it('touch() is idempotent and does not move the value (§6.3)', () => {
    const title = control('a');
    title.touch();
    title.touch();
    expect(title.touched()).toBe(true);
    expect(title()).toBe('a');
  });

  it('reset() goes back to the initial state (§6.3)', () => {
    const title = control('a');
    title.set('b');
    title.touch();

    title.reset();
    expect(title()).toBe('a');
    expect(title.touched()).toBe(false);
    expect(title.dirty()).toBe(false);
    expect(title.errors()).toBeNull();
  });

  it('reset(v) moves the baseline too (§6.3)', () => {
    const title = control('a');
    title.reset('z');
    expect(title()).toBe('z');
    expect(title.dirty()).toBe(false);

    title.set('a');
    // 'a' was the ORIGINAL value, but the baseline is 'z' now.
    expect(title.dirty()).toBe(true);
  });

  it('an effect that reads a control does not re-run when nothing moved', () => {
    const title = control('a');
    const run = vi.fn(() => {
      title();
    });
    const stop = effect(run);
    expect(run).toHaveBeenCalledTimes(1);

    title.set('a');
    expect(run).toHaveBeenCalledTimes(1);
    stop();
  });
});
