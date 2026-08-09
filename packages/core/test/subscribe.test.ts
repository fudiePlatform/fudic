import { describe, expect, it, vi } from 'vitest';
import { computed, effect, signal, subscribe } from '../src/index.js';

describe('subscribe over a signal (SDD-31 §6.18)', () => {
  it('delivers on movement and never on subscribe', () => {
    const s = signal(1);
    const fn = vi.fn();
    subscribe(s, fn);
    expect(fn).not.toHaveBeenCalled();
    s.set(2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(2);
  });

  it('stays quiet when Object.is filters the write', () => {
    const s = signal(1);
    const fn = vi.fn();
    subscribe(s, fn);
    s.set(1);
    expect(fn).not.toHaveBeenCalled();
  });

  it('the teardown cuts the delivery and is idempotent', () => {
    const s = signal(1);
    const fn = vi.fn();
    const off = subscribe(s, fn);
    off();
    off();
    s.set(2);
    expect(fn).not.toHaveBeenCalled();
  });

  it('reading the value back is delivery, not a dependency of whoever is running', () => {
    const a = signal(1);
    const b = signal(10);
    const seen: number[] = [];
    subscribe(b, (v) => void seen.push(v));
    let runs = 0;
    effect(() => {
      runs += 1;
      b.set(a() + 10); // the delivery happens inside this effect's tracking context
    });
    expect([runs, seen]).toEqual([1, [11]]);
    b.set(99);
    // Had the read leaked, the effect would now depend on `b` and run again.
    expect([runs, seen]).toEqual([1, [11, 99]]);
  });
});

describe('subscribe over a derived value (SDD-31 §6.19)', () => {
  it('delivers the new value when a leaf moves, and never on subscribe', () => {
    const a = signal(1);
    const double = computed(() => a() * 2);
    const fn = vi.fn();
    subscribe(double, fn);
    expect(fn).not.toHaveBeenCalled();
    a.set(4);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(8);
  });

  it('the teardown cuts the delivery', () => {
    const a = signal(1);
    const double = computed(() => a() * 2);
    const fn = vi.fn();
    subscribe(double, fn)();
    a.set(4);
    expect(fn).not.toHaveBeenCalled();
  });

  it('what the callback reads does not become a dependency of the channel', () => {
    const a = signal(1);
    const other = signal(100);
    const double = computed(() => a() * 2);
    const seen: number[] = [];
    subscribe(double, (v) => void seen.push(v + other()));
    a.set(2);
    expect(seen).toEqual([104]);
    other.set(200); // read only by the callback, so nothing is listening to it
    expect(seen).toEqual([104]);
    a.set(3);
    expect(seen).toEqual([104, 206]);
  });
});
