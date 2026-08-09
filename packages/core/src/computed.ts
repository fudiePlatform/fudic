/**
 * `computed` — a derived value, PULL (SDD-31 §4.2).
 *
 * A derived value subscribes to NOTHING. It remembers, from its last run, which
 * sources it read and what version each of them had; reading it walks that list
 * and compares integers. That is the whole model, and it buys the property that
 * makes `computed` asymmetric with `effect`: there is no disposer, so there is
 * no leak to forget. A derived value nobody reads never runs its `fn` and never
 * keeps anything alive.
 *
 * A derived value carries its own version, bumped when a recomputation produces
 * a different value by `Object.is`. That is all the cascade needs: a `computed`
 * over another `computed` compares versions exactly like over a signal, with no
 * special case written for nesting — and it CUTS, because an intermediate that
 * recomputes to the same value does not move its version.
 */

import { type Consumer, type Dependency, report, runTracked } from './tracking.js';

/** A derived value is exactly one operation: read it. */
export interface Computed<T> {
  /** Tracked read; recomputes only if some source moved. */
  (): T;
}

/** Anything readable in a tracked way: a signal or a derived value. */
export type Readable<T> = () => T;

/** One source of the last run, pinned at the version it had then. */
interface Binding {
  readonly dep: Dependency;
  readonly version: number;
}

export function computed<T>(fn: () => T): Computed<T> {
  let cache: { readonly value: T } | null = null;
  let version = 0;
  let bindings: readonly Binding[] = [];

  const someSourceMoved = (): boolean => {
    for (const b of bindings) {
      // `version()` on a derived source refreshes it first: that is what makes
      // the comparison meaningful two levels down.
      if (b.dep.version() !== b.version) {
        return true;
      }
    }
    return false;
  };

  const refresh = (): T => {
    const previous = cache;
    if (previous !== null && !someSourceMoved()) {
      return previous.value;
    }
    const next: Binding[] = [];
    const consumer: Consumer = {
      add: (dep) => {
        next.push({ dep, version: dep.version() });
      },
    };
    const value = runTracked(consumer, fn);
    bindings = next;
    if (previous !== null && !Object.is(value, previous.value)) {
      version += 1;
    }
    cache = { value };
    return value;
  };

  const self: Dependency = {
    version: () => {
      refresh();
      return version;
    },
    // The leaves behind a derived value are the leaves behind its sources: an
    // effect that reads it ends up subscribed to the signals at the bottom.
    collectLeaves: (out) => {
      for (const b of bindings) {
        b.dep.collectLeaves(out);
      }
    },
  };

  return () => {
    const value = refresh();
    report(self);
    return value;
  };
}
