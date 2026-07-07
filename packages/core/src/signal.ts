/**
 * `signal` — fine-grained reactivity (SDD-14 §4.4, decision 72). A signal holds a
 * value plus a live `Set` of subscribers. No automatic tracking in v1: render
 * objects subscribe explicitly in `mount()` and unsubscribe in `remove()`.
 * Rehydration is DOM-first: the signal is rebuilt from the painted markup, not
 * from a parallel state blob.
 */

export interface Signal<T> {
  /** Read the current value (v1: no automatic tracking). */
  (): T;
  /** Read without effects. */
  peek(): T;
  /** Write; notifies subscribers only when the value changes (`Object.is`). */
  set(v: T): void;
  /** Subscribe to changes; returns the unsubscribe. */
  subscribe(fn: (v: T) => void): () => void;
}

export function signal<T>(initial: T): Signal<T> {
  let value = initial;
  const subscribers = new Set<(v: T) => void>();

  const sig = (() => value) as Signal<T>;
  sig.peek = () => value;
  sig.set = (v: T) => {
    if (Object.is(v, value)) {
      return;
    }
    value = v;
    // Live set: a subscriber removed mid-notification is not called afterwards.
    for (const fn of subscribers) {
      fn(v);
    }
  };
  sig.subscribe = (fn: (v: T) => void) => {
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  };
  return sig;
}
