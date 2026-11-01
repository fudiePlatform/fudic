// A derived value subscribes to nothing. It remembers which sources its last run read and
// at which version; a read compares those versions and recomputes only if one moved. So it
// needs no disposer, and one nobody reads never runs. Its own version moves only when the
// result changes, which stops the cascade at an intermediate that recomputes to the same value.

import { type Consumer, type Dependency, report, runTracked, tagSource } from './tracking.js';

/** A derived value: call it to read. */
export interface Computed<T> {
  /** Reads the value, recomputing it only if a source changed. */
  (): T;
}

/** A signal or a derived value. */
export type Readable<T> = () => T;

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
      // On a derived source this refreshes it first.
      if (b.dep.version() !== b.version) return true;
    }
    return false;
  };

  const refresh = (): T => {
    const previous = cache;
    if (previous !== null && !someSourceMoved()) return previous.value;
    const next: Binding[] = [];
    const consumer: Consumer = {
      add: (dep) => {
        next.push({ dep, version: dep.version() });
      },
    };
    const value = runTracked(consumer, fn);
    bindings = next;
    if (previous !== null && !Object.is(value, previous.value)) version += 1;
    cache = { value };
    return value;
  };

  const self: Dependency = {
    version: () => {
      refresh();
      return version;
    },
    // An effect that reads this ends up subscribed to the signals underneath.
    collectLeaves: (out) => {
      for (const b of bindings) b.dep.collectLeaves(out);
    },
  };

  return tagSource(() => {
    const value = refresh();
    report(self);
    return value;
  });
}
