import { describe, expect, it, vi } from 'vitest';
import { signal } from '../src/index.js';

describe('signal (SDD-14 §6.6)', () => {
  it('reads the current value by call and by peek', () => {
    const s = signal(1);
    expect(s()).toBe(1);
    expect(s.peek()).toBe(1);
  });

  it('notifies subscribers when the value changes', () => {
    const s = signal(1);
    const fn = vi.fn();
    s.subscribe(fn);
    s.set(2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(2);
    expect(s()).toBe(2);
  });

  it('does not notify when Object.is holds (NaN included)', () => {
    const s = signal<number>(NaN);
    const fn = vi.fn();
    s.subscribe(fn);
    s.set(NaN);
    expect(fn).not.toHaveBeenCalled();
    expect(s.peek()).toBeNaN();
  });

  it('unsubscribe cuts the delivery', () => {
    const s = signal(0);
    const fn = vi.fn();
    const off = s.subscribe(fn);
    off();
    s.set(1);
    expect(fn).not.toHaveBeenCalled();
  });

  it('peek reads without effects', () => {
    const s = signal(3);
    const fn = vi.fn();
    s.subscribe(fn);
    expect(s.peek()).toBe(3);
    expect(fn).not.toHaveBeenCalled();
  });

  it('supports several live subscribers', () => {
    const s = signal('a');
    const first = vi.fn();
    const second = vi.fn();
    s.subscribe(first);
    s.subscribe(second);
    s.set('b');
    expect(first).toHaveBeenCalledWith('b');
    expect(second).toHaveBeenCalledWith('b');
  });
});
