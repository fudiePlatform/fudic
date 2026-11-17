import { describe, expect, it } from 'vitest';
import { computed, effect, painted, signal } from '../src/index.js';
import {
  type Dependency,
  type LeafSource,
  report,
  runTracked,
  untrack,
} from '../src/tracking.js';

/** A consumer that just writes down what was reported to it. */
function recorder(): { seen: Dependency[]; add(dep: Dependency): void } {
  const seen: Dependency[] = [];
  return { seen, add: (dep) => void seen.push(dep) };
}

describe('tracking (SDD-31 §4.1)', () => {
  it('a read outside any consumer reports to nobody', () => {
    const s = signal(1);
    expect(s()).toBe(1); // would throw if `report` dereferenced a null consumer
  });

  it('a read inside a consumer registers the dependency', () => {
    const s = signal(1);
    const c = recorder();
    expect(runTracked(c, () => s())).toBe(1);
    expect(c.seen).toHaveLength(1);
    expect(c.seen[0]!.version()).toBe(0);
  });

  it('the version moves only on a set that passes Object.is', () => {
    const s = signal(1);
    const c = recorder();
    runTracked(c, () => s());
    const dep = c.seen[0]!;
    s.set(1);
    expect(dep.version()).toBe(0);
    s.set(2);
    expect(dep.version()).toBe(1);
  });

  it('a signal collects itself as the only leaf behind it', () => {
    const s = signal(1);
    const c = recorder();
    runTracked(c, () => s());
    const leaves = new Set<LeafSource>();
    c.seen[0]!.collectLeaves(leaves);
    expect(leaves.size).toBe(1);
  });

  it('nests: the inner consumer takes over and hands the outer back', () => {
    const s = signal(1);
    const outer = recorder();
    const inner = recorder();
    runTracked(outer, () => {
      runTracked(inner, () => s());
      s();
    });
    expect(inner.seen).toHaveLength(1);
    expect(outer.seen).toHaveLength(1);
  });

  it('untrack suppresses the registration, and restores even if fn throws', () => {
    const s = signal(1);
    const c = recorder();
    runTracked(c, () => {
      untrack(() => s());
      expect(() => {
        untrack(() => {
          throw new Error('boom');
        });
      }).toThrow('boom');
      s();
    });
    expect(c.seen).toHaveLength(1);
  });

  it('report outside a consumer is a no-op', () => {
    const dep: Dependency = { version: () => 0, collectLeaves: () => {} };
    expect(() => report(dep)).not.toThrow();
  });
});

/**
 * SDD-86 (framework fix) — `painted`: what hydration adopts by. Inside it every signal answers
 * the value it was created with (what the server painted), every derived value is computed
 * from those without being cached, and nothing is tracked.
 */
describe('painted', () => {
  it('a signal answers its initial value inside, the live one outside', () => {
    const s = signal(1);
    s.set(2);
    expect(painted(() => s())).toBe(1);
    expect(s()).toBe(2);
  });

  it('a computed is derived from the painted values, and its cache is left alone', () => {
    const s = signal(1);
    const twice = computed(() => s() * 2);
    s.set(5);
    expect(twice()).toBe(10);
    expect(painted(() => twice())).toBe(2);
    // Not cached as current: outside, it is still the live value.
    expect(twice()).toBe(10);
  });

  it('tracks nothing: an effect that reads inside it does not rerun on a write', () => {
    const s = signal(0);
    let runs = 0;
    effect(() => {
      runs += 1;
      painted(() => s());
    });
    s.set(1);
    expect(runs).toBe(1);
  });

  it('nests, and the outer one is still painting when the inner returns', () => {
    const s = signal('a');
    s.set('b');
    expect(painted(() => [painted(() => s()), s()])).toEqual(['a', 'a']);
    expect(s()).toBe('b');
  });

  it('restores when fn throws: reads after it are live again', () => {
    const s = signal('first');
    s.set('second');
    expect(() =>
      painted(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(s()).toBe('second');
  });

  it('returns what fn returns', () => {
    expect(painted(() => 42)).toBe(42);
  });
});
