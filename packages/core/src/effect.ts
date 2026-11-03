/**
 * `effect` — run, track, resubscribe (SDD-31 §4.3).
 *
 * An effect is PUSH, and it subscribes to the LEAVES: a `computed` read inside
 * it recomputes in its own context and then hands over the signals underneath,
 * so what the effect ends up subscribed to is the bottom of the graph. That is
 * the deliberate half of the design — there is no equality cut at the derived
 * boundary, and `$w` on the emit side is where that cut is paid instead.
 *
 * Dependencies are recomputed on every run, never accumulated: an `if` inside
 * the body changes what the body reads, so it changes what the effect depends
 * on. And so is the cleanup: whatever a run set up is torn down with that run,
 * which is why the cleanup is the body's return value and not a disposer the
 * caller has to keep.
 *
 * The dependencies can also be declared (SDD-76): `effect(fn, [a, b])` tracks
 * only `a` and `b`, compares their values, and runs the body untracked — the
 * dependency array of React, as an opt-in. Without it nothing changes.
 *
 * Every cleanup a body returns runs exactly once, and nothing stays subscribed after
 * the disposer, whatever happens mid-run (SDD-76 §4.4): a run that is disposed, or
 * overtaken by a re-entrant one, while its body runs undoes itself on the spot.
 */

import type { Readable } from './computed.js';
import { own } from './owner.js';
import { type Consumer, type LeafSource, runTracked, untrack } from './tracking.js';

/** What an effect may return to undo what it just did. */
export type Cleanup = () => void;

/**
 * How many chained runs we allow before calling it a feedback loop. An effect
 * that writes a signal it reads re-enters through its own live subscription;
 * this is the count that turns an infinite loop into an error with a name.
 */
const MAX_CHAINED_RUNS = 100;

/**
 * Run `fn`, and run it again when what it depends on changes.
 *
 * Without `deps` it depends on everything `fn` reads. With `deps` it depends on
 * those sources ONLY, reruns only when one of their values changed (`Object.is`),
 * and `fn` runs untracked; `[]` runs once and cleans up on dispose.
 *
 * If `fn` returns a function, that is its cleanup: it runs before every rerun and
 * on dispose. Returns the disposer.
 */
export function effect(
  fn: () => void | Cleanup,
  deps?: readonly Readable<unknown>[],
): () => void {
  // Keyed by leaf, so a rerun can DIFF instead of unsubscribing and resubscribing
  // wholesale. That is not an optimisation: a signal notifies by walking its live
  // `Set`, and a `Set` revisits what is appended behind the cursor, so an effect
  // that dropped itself and re-added itself mid-notification would be called
  // again, and again, forever.
  const sources = new Map<LeafSource, () => void>();
  // Copied: what the caller does to its array afterwards changes nothing here.
  const declared = deps === undefined ? null : [...deps];
  // The values the declared dependencies had on the last run that got past the cut.
  let last: readonly unknown[] | null = null;
  let cleanup: Cleanup | null = null;
  let disposed = false;
  let chained = 0;
  // Counts runs ever started. A run that finds it moved on while its body ran was
  // superseded by a re-entrant one, which already left the fresher cleanup and
  // subscriptions behind.
  let started = 0;

  const unsubscribeAll = (): void => {
    for (const off of sources.values()) {
      off();
    }
    sources.clear();
  };

  /** Undoing something is not reading state to depend on: never tracked. */
  const runCleanup = (): void => {
    const pending = cleanup;
    cleanup = null;
    if (pending !== null) {
      untrack(pending);
    }
  };

  /** Whether the run numbered `self` is still the one that gets to publish. */
  const current = (self: number): boolean => !disposed && self === started;

  /** Subscribe to exactly `leaves`, keeping the subscriptions that stay. */
  const reconcile = (leaves: ReadonlySet<LeafSource>): void => {
    for (const [leaf, off] of sources) {
      if (!leaves.has(leaf)) {
        off();
        sources.delete(leaf);
      }
    }
    for (const leaf of leaves) {
      if (!sources.has(leaf)) {
        sources.set(leaf, leaf.subscribe(run));
      }
    }
  };

  /**
   * Keep what the body returned, or — for a run that is no longer the current one —
   * undo it on the spot: disposed while its body ran, or overtaken by a re-entrant
   * run. Nobody else will ever hold that cleanup.
   */
  const publish = (self: number, returned: void | Cleanup): boolean => {
    const next = typeof returned === 'function' ? returned : null;
    if (current(self)) {
      cleanup = next;
      return true;
    }
    if (next !== null) {
      untrack(next);
    }
    return false;
  };

  const collector = (leaves: Set<LeafSource>): Consumer => ({
    add: (dep) => {
      dep.collectLeaves(leaves);
    },
  });

  /** Without `deps`: everything the body reads is a dependency (SDD-31 §4.3). */
  const runTracking = (self: number): void => {
    runCleanup();
    const leaves = new Set<LeafSource>();
    const returned = runTracked(collector(leaves), fn);
    // Reconciled AFTER the body, not before it: while `fn` runs the previous
    // subscriptions are still live, which is what lets a self-feeding effect
    // re-enter and hit the guard above instead of silently doing nothing.
    if (publish(self, returned)) {
      reconcile(leaves);
    }
  };

  /**
   * With `deps`: only they are tracked, and the body runs only when one of their
   * values moved (SDD-76 §4.2). Reconciling before the body is safe here — the
   * leaves are final once the dependencies are read, and the diff leaves the live
   * ones in place, so a body that writes a dependency still re-enters.
   */
  const runDeclared = (self: number, list: readonly Readable<unknown>[]): void => {
    const leaves = new Set<LeafSource>();
    const values = runTracked(collector(leaves), () => list.map((dep) => dep()));
    if (!current(self)) {
      return;
    }
    // Subscriptions follow the dependencies even when the values do not move: one
    // with a branch inside may read something else and return the same thing.
    reconcile(leaves);
    const previous = last;
    if (previous !== null && values.every((value, i) => Object.is(value, previous[i]))) {
      return;
    }
    last = values;
    runCleanup();
    publish(self, untrack(fn));
  };

  const run = (): void => {
    if (disposed) {
      return;
    }
    chained += 1;
    if (chained > MAX_CHAINED_RUNS) {
      chained -= 1;
      throw new Error(
        'fudic: effect feedback loop — this effect writes a signal it also reads, ' +
          `so each run schedules another one (stopped after ${MAX_CHAINED_RUNS}).`,
      );
    }
    const self = ++started;
    try {
      if (declared === null) {
        runTracking(self);
      } else {
        runDeclared(self, declared);
      }
    } finally {
      chained -= 1;
    }
  };

  const dispose = (): void => {
    disposed = true;
    unsubscribeAll();
    runCleanup();
  };

  // A first run that throws hands nobody a disposer, so it must leave nothing to
  // dispose: with `deps` the leaves are already subscribed when the body runs, and
  // a re-entrant run may already have published a cleanup.
  try {
    run();
  } catch (error) {
    dispose();
    throw error;
  }
  // Created while a component's code block runs: it is torn down with the component.
  own(dispose);
  return dispose;
}
