/**
 * `batch` — group writes so that two of them are one notification (SDD-31 §4.4).
 *
 * Without grouping, `a.set(1); b.set(2)` runs every effect that depends on both
 * twice, and the first time it runs with `b` still on its old value. Inside a
 * batch a `set` updates value and version IMMEDIATELY — a read two lines later
 * has to see what was just written — but instead of notifying it parks the
 * affected subscribers in a set. Leaving the OUTERMOST batch runs each of them
 * once; nesting does not nest flushes.
 *
 * Dedupe is by subscriber identity, which is why `signal` stores zero-arg thunks
 * and not the caller's callback: an effect on two signals written in the same
 * batch is one entry, so it runs once.
 */

let depth = 0;
const pending = new Set<() => void>();

/**
 * Deliver a signal's change to its subscribers, or park them if a batch is open.
 * Outside a batch the live `Set` is walked directly, so a subscriber removed
 * mid-notification is still not called.
 */
export function notify(subscribers: Iterable<() => void>): void {
  if (depth === 0) {
    for (const fn of subscribers) {
      fn();
    }
    return;
  }
  for (const fn of subscribers) {
    pending.add(fn);
  }
}

export function batch<T>(fn: () => T): T {
  depth += 1;
  try {
    return fn();
  } finally {
    depth -= 1;
    if (depth === 0) {
      flush();
    }
  }
}

/**
 * One pass is enough, and that is not an oversight: `depth` is already back to
 * zero here, so anything a subscriber writes notifies synchronously instead of
 * queueing behind us.
 */
function flush(): void {
  const round = [...pending];
  pending.clear();
  for (const fn of round) {
    fn();
  }
}
