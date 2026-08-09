/**
 * `signal` — fine-grained reactivity (SDD-14 §4.4, decision 72). A signal holds a
 * value, a version counter and a live `Set` of subscribers.
 *
 * Since SDD-31 the call form is a TRACKED read: inside an `effect` or a
 * `computed` it registers the dependency, while `peek()` never does. The emitted
 * code is untouched by that — it writes `peek()` and `subscribe()`, never `sig()`.
 * The version counter is what lets a derived value cache without subscribing to
 * anything (SDD-31 §4.2): one integer per signal, not one more `Set`.
 *
 * Rehydration is DOM-first: the signal is rebuilt from the painted markup, not
 * from a parallel state blob.
 */

import { notify } from './batch.js';
import { type LeafSource, report } from './tracking.js';

export interface Signal<T> {
  /** Tracked read: inside an `effect` or a `computed`, registers the dependency. */
  (): T;
  /** Loose read: never registers anything. */
  peek(): T;
  /** Write; notifies subscribers only when the value changes (`Object.is`). */
  set(v: T): void;
  /** Subscribe to changes; returns the unsubscribe. */
  subscribe(fn: (v: T) => void): () => void;
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
  sig.peek = () => value;
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
  sig.subscribe = (fn: (v: T) => void) =>
    source.subscribe(() => {
      fn(value);
    });
  return sig;
}
