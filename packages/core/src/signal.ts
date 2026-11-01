import { notify } from './batch.js';
import { type LeafSource, report, tagLeaf } from './tracking.js';

/** A reactive value: call it to read, `set` to write. */
export interface Signal<T> {
  /** Reads the value. Inside an `effect` or a `computed`, also registers the dependency. */
  (): T;
  /** Writes the value. Subscribers are notified only if it changed (`Object.is`). */
  set(v: T): void;
}

export function signal<T>(initial: T): Signal<T> {
  let value = initial;
  // Lets a derived value tell whether this changed without subscribing to it.
  let version = 0;
  // Zero-argument thunks, so a batch can run each subscriber once.
  const subscribers = new Set<() => void>();

  const source: LeafSource = {
    version: () => version,
    collectLeaves: (out) => {
      out.add(source);
    },
    subscribe: (fn) => {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
  };

  const sig = (() => {
    report(source);
    return value;
  }) as Signal<T>;
  sig.set = (v: T) => {
    if (Object.is(v, value)) return;
    // The value moves at once, even inside a batch: only the notification waits.
    value = v;
    version += 1;
    notify(subscribers);
  };
  return tagLeaf(sig, source);
}
