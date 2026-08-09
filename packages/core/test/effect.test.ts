import { describe, expect, it, vi } from 'vitest';
import { batch, computed, effect, signal, untrack } from '../src/index.js';

describe('effect (SDD-31 §6.6–§6.10)', () => {
  it('runs once on creation and once per change of what it read', () => {
    const a = signal(1);
    const seen: number[] = [];
    effect(() => {
      seen.push(a());
    });
    expect(seen).toEqual([1]);
    a.set(2);
    a.set(2); // filtered by Object.is: no notification, no run
    a.set(3);
    expect(seen).toEqual([1, 2, 3]);
  });

  it('subscribes to the leaves behind a derived value, not to the derived value', () => {
    const a = signal(1);
    const double = computed(() => a() * 2);
    const seen: number[] = [];
    effect(() => {
      seen.push(double());
    });
    a.set(4);
    expect(seen).toEqual([2, 8]);
  });

  it('recomputes its dependencies on every run', () => {
    const flag = signal(true);
    const x = signal('x1');
    const y = signal('y1');
    const seen: string[] = [];
    effect(() => {
      seen.push(flag() ? x() : y());
    });
    expect(seen).toEqual(['x1']);

    y.set('y2'); // not a dependency yet
    expect(seen).toEqual(['x1']);

    flag.set(false);
    expect(seen).toEqual(['x1', 'y2']);

    x.set('x2'); // no longer a dependency
    expect(seen).toEqual(['x1', 'y2']);

    y.set('y3');
    expect(seen).toEqual(['x1', 'y2', 'y3']);
  });

  it('the disposer cuts every subscription and is idempotent', () => {
    const a = signal(1);
    const fn = vi.fn(() => void a());
    const off = effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    off();
    a.set(2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('an effect disposed mid-flush does not run', () => {
    const a = signal(0);
    const seen: number[] = [];
    let off = (): void => {};
    effect(() => {
      a();
      off();
    });
    off = effect(() => {
      seen.push(a());
    });
    seen.length = 0;
    // Both are queued by the batch; the first one disposes the second before
    // the flush reaches it.
    batch(() => {
      a.set(1);
    });
    expect(seen).toEqual([]);
  });

  it('untrack inside the body suppresses the dependency', () => {
    const a = signal(1);
    const b = signal(10);
    const seen: number[] = [];
    effect(() => {
      seen.push(a() + untrack(() => b()));
    });
    b.set(20);
    expect(seen).toEqual([11]);
    a.set(2);
    expect(seen).toEqual([11, 22]);
  });

  it('feedback throws after a bounded number of chained runs', () => {
    const a = signal(0);
    effect(() => {
      a.set(a() + 1);
    });
    expect(() => a.set(100)).toThrow(/feedback loop/);
  });
});

describe('effect cleanup (SDD-31 §6.21)', () => {
  it('runs before the next run and once on dispose', () => {
    const a = signal(1);
    const log: string[] = [];
    const off = effect(() => {
      const v = a();
      log.push(`up:${v}`);
      return () => log.push(`down:${v}`);
    });
    a.set(2);
    a.set(3);
    off();
    off();
    expect(log).toEqual(['up:1', 'down:1', 'up:2', 'down:2', 'up:3', 'down:3']);
  });

  it('a listener effect ends with exactly one alive, and none after dispose', () => {
    const a = signal(1);
    const alive = new Set<() => void>();
    const off = effect(() => {
      a();
      const handler = (): void => {};
      alive.add(handler);
      return () => alive.delete(handler);
    });
    a.set(2);
    a.set(3);
    expect(alive.size).toBe(1);
    off();
    expect(alive.size).toBe(0);
  });

  it('the cleanup does not track what it reads', () => {
    const a = signal(1);
    const b = signal(10);
    let runs = 0;
    effect(() => {
      runs += 1;
      a();
      return () => void b();
    });
    a.set(2);
    expect(runs).toBe(2);
    b.set(20); // read only by the cleanup, so it is nobody's dependency
    expect(runs).toBe(2);
  });
});

describe('batch (SDD-31 §6.11–§6.13)', () => {
  it('without it, two writes are two runs and the first sees the old value', () => {
    const a = signal(0);
    const b = signal(0);
    const seen: string[] = [];
    effect(() => {
      seen.push(`${a()}/${b()}`);
    });
    a.set(1);
    b.set(2);
    expect(seen).toEqual(['0/0', '1/0', '1/2']);
  });

  it('with it, two writes are one run and it sees both new values', () => {
    const a = signal(0);
    const b = signal(0);
    const seen: string[] = [];
    effect(() => {
      seen.push(`${a()}/${b()}`);
    });
    batch(() => {
      a.set(1);
      b.set(2);
    });
    expect(seen).toEqual(['0/0', '1/2']);
  });

  it('a read inside the batch already sees the new value', () => {
    const a = signal(1);
    const inside = batch(() => {
      a.set(5);
      return a();
    });
    expect(inside).toBe(5);
  });

  it('returns what fn returns', () => {
    expect(batch(() => 'done')).toBe('done');
  });

  it('nesting does not nest flushes: only the outermost one delivers', () => {
    const a = signal(0);
    const b = signal(0);
    const seen: string[] = [];
    effect(() => {
      seen.push(`${a()}/${b()}`);
    });
    batch(() => {
      batch(() => {
        a.set(1);
      });
      expect(seen).toEqual(['0/0']); // the inner batch delivered nothing
      b.set(2);
    });
    expect(seen).toEqual(['0/0', '1/2']);
  });

  it('flushes even if fn throws', () => {
    const a = signal(0);
    const seen: number[] = [];
    effect(() => {
      seen.push(a());
    });
    expect(() =>
      batch(() => {
        a.set(1);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(seen).toEqual([0, 1]);
  });
});
