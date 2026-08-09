/**
 * `signal` — fine-grained reactivity (SDD-14 §4.4, decision 72). A signal holds a
 * value, a version counter and a live `Set` of subscribers.
 *
 * Two operations, and only two: read it and write it (SDD-31 §4.0). The call form
 * is a TRACKED read — inside an `effect` or a `computed` it registers the
 * dependency, and outside one, which is where handlers and `h()` live, it does
 * nothing at all. `peek()` is gone because it was the same function; the loose
 * read inside a consumer is `untrack`, spelled out where it matters. Subscription
 * is not a method either: it is the emit's channel, imported as a function, and
 * a view author who needs to react has `effect`, which hands back its teardown.
 *
 * The version counter is what lets a derived value cache without subscribing to
 * anything (SDD-31 §4.2): one integer per signal, not one more `Set`.
 *
 * Rehydration is DOM-first: the signal is rebuilt from the painted markup, not
 * from a parallel state blob.
 */

import { notify } from './batch.js';
import { type LeafSource, report, tagLeaf } from './tracking.js';

export interface Signal<T> {
  /** Tracked read: inside an `effect` or a `computed`, registers the dependency. */
  (): T;
  /** Write; notifies subscribers only when the value changes (`Object.is`). */
  set(v: T): void;
}

export function signal<T>(initial: T): Signal<T> {
  let value = initial;
  let version = 0;
  // Stored as thunks so that a batch can dedupe by subscriber identity: an
  // effect subscribed to two signals written in the same batch runs once.
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
    if (Object.is(v, value)) {
      return;
    }
    // Value and version move immediately, batch or no batch: a read on the next
    // line has to see what was just written. Only the delivery can be deferred.
    value = v;
    version += 1;
    notify(subscribers);
  };
  return tagLeaf(sig, source);
}
