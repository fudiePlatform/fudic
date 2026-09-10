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
import { isSource, leafOf, untrack } from './tracking.js';

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

/** One disposer for every name that turned out not to be reactive. */
const NOTHING = (): void => {};

/**
 * `subscribe`, for a name the compiler could not prove is reactive — an IMPORT.
 *
 * A component that declares `const count = signal(0)` is read by the emit, and `$sub` is
 * written for it. A component that writes `import { count } from './store.js'` gives the
 * emit a name and nothing else: the module is another file, the emit is per file, and
 * whether `count` is a signal, a derived value or a plain helper is not knowable there.
 *
 * So the decision moves to RUN time, where the value itself is in hand. It cannot be
 * `subscribe` with a guard at the call site: `subscribe` on a non-source falls into its
 * effect branch and CALLS what it is given, so a helper would be run instead of a signal
 * watched. The test has to come first, and it is a brand rather than a shape check —
 * `typeof x === 'function'` is true of every helper in the file.
 */
export function subscribeIf(source: unknown, fn: (v: unknown) => void): () => void {
  return isSource(source) ? subscribe(source as Readable<unknown>, fn) : NOTHING;
}
