import type { Readable } from './computed.js';
import { effect } from './effect.js';
import { isSource, leafOf, untrack } from './tracking.js';

/**
 * Calls `fn` with the new value each time `source` changes, never on subscribe. Used by
 * compiled components; in a view, `effect` does the same and owns its teardown.
 */
export function subscribe<T>(source: Readable<T>, fn: (v: T) => void): () => void {
  const leaf = leafOf(source);
  if (leaf !== null) {
    // Reading the value back is delivery, not a dependency of whatever is running.
    return leaf.subscribe(() => {
      fn(untrack(source));
    });
  }
  // A derived value has no subscribers of its own: an effect watches it, skipping its first
  // run because the initial value is already painted.
  let primed = false;
  return effect(() => {
    const value = source();
    if (!primed) {
      primed = true;
      return;
    }
    untrack(() => {
      fn(value);
    });
  });
}

/**
 * Whether any of these signals was written since it was created. Hydration adopts the
 * server's markup without painting, so a write made before the subscriptions existed has to
 * be detected and painted.
 */
export function written(...sources: readonly Readable<unknown>[]): boolean {
  return sources.some((source) => leafOf(source)!.version() > 0);
}

const NOTHING = (): void => {};

/**
 * `subscribe` for an imported name, which may be a signal, a derived value or a plain
 * function. Only a signal or a derived value is watched: `subscribe` would call a plain
 * function instead of watching it.
 */
export function subscribeIf(source: unknown, fn: (v: unknown) => void): () => void {
  return isSource(source) ? subscribe(source as Readable<unknown>, fn) : NOTHING;
}
