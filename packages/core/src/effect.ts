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
 */

import { type Consumer, type LeafSource, runTracked, untrack } from './tracking.js';

/** What an effect may return to undo what it just did. */
export type Cleanup = () => void;

/**
 * How many chained runs we allow before calling it a feedback loop. An effect
 * that writes a signal it reads re-enters through its own live subscription;
 * this is the count that turns an infinite loop into an error with a name.
 */
const MAX_CHAINED_RUNS = 100;

export function effect(fn: () => void | Cleanup): () => void {
  // Keyed by leaf, so a rerun can DIFF instead of unsubscribing and resubscribing
  // wholesale. That is not an optimisation: a signal notifies by walking its live
  // `Set`, and a `Set` revisits what is appended behind the cursor, so an effect
  // that dropped itself and re-added itself mid-notification would be called
  // again, and again, forever.
  const sources = new Map<LeafSource, () => void>();
  let cleanup: Cleanup | null = null;
  let disposed = false;
  let chained = 0;

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
    runCleanup();
    const leaves = new Set<LeafSource>();
    const consumer: Consumer = {
      add: (dep) => {
        dep.collectLeaves(leaves);
      },
    };
    let next: Cleanup | null = null;
    try {
      const returned = runTracked(consumer, fn);
      next = typeof returned === 'function' ? returned : null;
    } finally {
      chained -= 1;
    }
    cleanup = next;
    // Reconciled AFTER the body, not before it: while `fn` runs the previous
    // subscriptions are still live, which is what lets a self-feeding effect
    // re-enter and hit the guard above instead of silently doing nothing.
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

  run();

  return () => {
    disposed = true;
    unsubscribeAll();
    runCleanup();
  };
}
