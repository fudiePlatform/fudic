let depth = 0;
const pending = new Set<() => void>();

/** Notifies `subscribers` now, or once at the end of the outermost open batch. */
export function notify(subscribers: Iterable<() => void>): void {
  if (depth === 0) {
    // The live set, so a subscriber removed mid-notification is not called.
    for (const fn of subscribers) fn();
    return;
  }
  for (const fn of subscribers) pending.add(fn);
}

/**
 * Runs `fn` and delivers its writes as one notification when the outermost batch ends:
 * a subscriber of two signals written inside it runs once, seeing both new values.
 * Reads inside the batch already see the new values.
 */
export function batch<T>(fn: () => T): T {
  depth += 1;
  try {
    return fn();
  } finally {
    depth -= 1;
    if (depth === 0) flush();
  }
}

// One pass: `depth` is already zero, so whatever a subscriber writes notifies at once.
function flush(): void {
  const round = [...pending];
  pending.clear();
  for (const fn of round) fn();
}
