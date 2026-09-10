import { describe, expect, it, vi } from 'vitest';
import { computed, effect, signal, subscribe, subscribeIf } from '../src/index.js';

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

/**
 * `subscribeIf` — the channel for a name the compiler could not prove is reactive.
 *
 * A component that writes `import { count } from './store.js'` hands the emit a name and
 * nothing else: the module is another file, and whether `count` is a signal, a derived value
 * or a plain helper is not knowable there. So the question is asked of the VALUE, here.
 */
describe('subscribeIf over a name of unknown shape', () => {
  it('watches a signal exactly as `subscribe` does', () => {
    const s = signal(1);
    const fn = vi.fn();
    subscribeIf(s, fn);
    expect(fn).not.toHaveBeenCalled();
    s.set(2);
    expect(fn).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('watches a derived value through the leaf underneath it', () => {
    const a = signal(1);
    const double = computed(() => a() * 2);
    const fn = vi.fn();
    subscribeIf(double, fn);
    a.set(4);
    expect(fn).toHaveBeenCalledExactlyOnceWith(8);
  });

  it('NEVER calls a plain function — which is the whole reason it exists', () => {
    // `subscribe` on a non-source falls into its effect branch and CALLS what it is given.
    // A store exports its writers beside its state (`export function inc()`), and the emit
    // cannot tell one from the other, so it hands over both. Running `inc` at hookup would
    // move the value every time a component woke up.
    const helper = vi.fn(() => 'nothing reactive');
    const fn = vi.fn();
    subscribeIf(helper, fn);
    expect(helper).not.toHaveBeenCalled();
    expect(fn).not.toHaveBeenCalled();
  });

  it('is inert for a value that is not a function at all', () => {
    const fn = vi.fn();
    for (const value of [undefined, null, 0, 'count', { count: 1 }, [1, 2]]) {
      expect(() => subscribeIf(value, fn)()).not.toThrow();
    }
    expect(fn).not.toHaveBeenCalled();
  });

  it('hands back a teardown for the inert case too, and it is idempotent', () => {
    // The emitted chunk pushes every one of these into `$d` and calls them all in `r()`;
    // a channel that returned nothing would make the teardown of a component that reads a
    // store a `TypeError` on disconnect.
    const off = subscribeIf('not a source', vi.fn());
    expect(typeof off).toBe('function');
    expect(() => {
      off();
      off();
    }).not.toThrow();
  });

  it('the teardown of a real source still cuts the delivery', () => {
    const s = signal(1);
    const fn = vi.fn();
    subscribeIf(s, fn)();
    s.set(2);
    expect(fn).not.toHaveBeenCalled();
  });
});
