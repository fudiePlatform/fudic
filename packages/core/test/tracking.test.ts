import { describe, expect, it } from 'vitest';
import { signal } from '../src/index.js';
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
