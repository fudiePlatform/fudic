/**
 * `subscribe` — the EMIT's channel, not a view operation (SDD-31 §4.0, §4.8).
 *
 * The emitted chunk of a component pushes a crossed value into a child once at
 * hookup and once per notification (BUG-12 §3.4); this is the second half. It is
 * a free function rather than a method precisely so that it does not show up in
 * a view author's IntelliSense, where taking it means owning a teardown that
 * `effect` returns for free.
 *
 * It works the same on a signal and on a derived value, which is what lets the
 * emit stop caring which of the two a name is (§4.7). A signal is hooked to its
 * leaf directly; a derived value has no subscribers of its own — that is the
 * whole point of pull — so the channel there is an effect whose first pass is
 * swallowed, because the initial value was already painted by `$s`.
 *
 * It never delivers on subscribe, in either shape.
 */

import type { Readable } from './computed.js';
import { effect } from './effect.js';
import { leafOf, untrack } from './tracking.js';

export function subscribe<T>(source: Readable<T>, fn: (v: T) => void): () => void {
  const leaf = leafOf(source);
  if (leaf !== null) {
    // `untrack` because a `set` can happen inside an effect, and the value this
    // callback reads back is delivery, not a dependency of whoever is running.
    return leaf.subscribe(() => {
      fn(untrack(source));
    });
  }
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
