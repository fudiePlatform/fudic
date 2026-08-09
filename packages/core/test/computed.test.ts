import { describe, expect, it } from 'vitest';
import { computed, signal, untrack } from '../src/index.js';
import { type Dependency, type LeafSource, runTracked } from '../src/tracking.js';

/** A consumer that just writes down what was reported to it. */
function recorder(): { seen: Dependency[]; add(dep: Dependency): void } {
  const seen: Dependency[] = [];
  return { seen, add: (dep) => void seen.push(dep) };
}

describe('computed (SDD-31 §6.1–§6.5)', () => {
  it('derives, and does not recompute while no source moved', () => {
    const a = signal(2);
    let runs = 0;
    const double = computed(() => {
      runs += 1;
      return a() * 2;
    });
    expect(double()).toBe(4);
    expect(double()).toBe(4);
    expect(runs).toBe(1);
  });

  it('recomputes once per observed move, not once per read', () => {
    const a = signal(1);
    let runs = 0;
    const double = computed(() => {
      runs += 1;
      return a() * 2;
    });
    double();
    a.set(2);
    expect(double()).toBe(4);
    expect(double()).toBe(4);
    expect(runs).toBe(2);
    a.set(3);
    a.set(4);
    expect(double()).toBe(8);
    expect(runs).toBe(3);
  });

  it('a set that Object.is filters out does not make it stale', () => {
    const a = signal(1);
    let runs = 0;
    const double = computed(() => {
      runs += 1;
      return a() * 2;
    });
    double();
    a.set(1);
    double();
    expect(runs).toBe(1);
  });

  it('untrack shares the cache and registers no dependency', () => {
    const a = signal(2);
    let runs = 0;
    const double = computed(() => {
      runs += 1;
      return a() * 2;
    });
    const c = recorder();
    const seen = runTracked(c, () => untrack(() => double()));
    expect(seen).toBe(4);
    expect(runs).toBe(1);
    expect(c.seen).toHaveLength(0);
  });

  it('reported to a consumer, a derived value hands over its leaf signals', () => {
    const a = signal(1);
    const b = signal(2);
    const sum = computed(() => a() + b());
    const nested = computed(() => sum() * 10);
    const c = recorder();
    runTracked(c, () => nested());
    const leaves = new Set<LeafSource>();
    for (const dep of c.seen) {
      dep.collectLeaves(leaves);
    }
    // Two levels of derivation, and what comes out the other side is the two
    // signals at the bottom — never the derived values in between.
    expect(leaves.size).toBe(2);
  });

  it('nesting propagates a real change', () => {
    const a = signal(1);
    const c1 = computed(() => a() * 2);
    const c2 = computed(() => c1() + 1);
    expect(c2()).toBe(3);
    a.set(5);
    expect(c2()).toBe(11);
  });

  it('nesting CUTS when the intermediate recomputes to the same value', () => {
    const a = signal(1);
    let inner = 0;
    let outer = 0;
    const positive = computed(() => {
      inner += 1;
      return a() > 0;
    });
    const label = computed(() => {
      outer += 1;
      return positive() ? 'yes' : 'no';
    });
    expect(label()).toBe('yes');
    expect([inner, outer]).toEqual([1, 1]);

    a.set(2); // the source moved, the intermediate did not
    expect(label()).toBe('yes');
    expect(inner).toBe(2);
    expect(outer).toBe(1);

    a.set(-1); // now it does
    expect(label()).toBe('no');
    expect([inner, outer]).toEqual([3, 2]);
  });

  it('a derived value nobody reads never runs its fn', () => {
    const a = signal(1);
    let runs = 0;
    computed(() => {
      runs += 1;
      return a() * 2;
    });
    a.set(2);
    a.set(3);
    expect(runs).toBe(0);
  });
});
