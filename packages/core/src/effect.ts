import { own } from './owner.js';
import { type Consumer, type LeafSource, runTracked, untrack } from './tracking.js';

/** What an effect may return to undo what its run did. */
export type Cleanup = () => void;

// An effect that writes a signal it reads runs again from inside itself; past this many
// chained runs it is a feedback loop.
const MAX_CHAINED_RUNS = 100;

/**
 * Runs `fn` now and again whenever a signal it read changes. Its dependencies are those of
 * the last run, and what `fn` returns is called before the next run and on dispose. Created
 * while a component sets up, it is disposed with the component. Returns the disposer.
 */
export function effect(fn: () => void | Cleanup): () => void {
  // A rerun diffs its subscriptions rather than dropping and re-adding them: a `Set` visits
  // entries added during iteration, so re-adding itself mid-notification would loop forever.
  const sources = new Map<LeafSource, () => void>();
  let cleanup: Cleanup | null = null;
  let disposed = false;
  let chained = 0;

  const unsubscribeAll = (): void => {
    for (const off of sources.values()) off();
    sources.clear();
  };

  const runCleanup = (): void => {
    const pending = cleanup;
    cleanup = null;
    if (pending !== null) untrack(pending);
  };

  const run = (): void => {
    if (disposed) return;
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
    // Reconciled after the run, so a self-feeding effect re-enters through its live
    // subscriptions and hits the loop guard instead of silently stopping.
    for (const [leaf, off] of sources) {
      if (!leaves.has(leaf)) {
        off();
        sources.delete(leaf);
      }
    }
    for (const leaf of leaves) {
      if (!sources.has(leaf)) sources.set(leaf, leaf.subscribe(run));
    }
  };

  run();

  const dispose = (): void => {
    disposed = true;
    unsubscribeAll();
    runCleanup();
  };
  own(dispose);
  return dispose;
}
